import test from 'node:test';
import assert from 'node:assert/strict';

function makeEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) { listeners.push(listener); },
    emit(...args) { return Promise.all(listeners.map((listener) => listener(...args))); },
  };
}

function clone(value) {
  return structuredClone(value);
}

function makeChromeMock() {
  const events = {
    actionClicked: makeEvent(),
    runtimeMessage: makeEvent(),
    tabsUpdated: makeEvent(),
    tabsRemoved: makeEvent(),
    tabsActivated: makeEvent(),
    windowsFocusChanged: makeEvent(),
  };
  const state = {
    permissionsAllowed: true,
    permissionChecks: 0,
    tabsCreated: 0,
    nextTabId: 40,
    tabs: new Map(),
    windows: new Map([[1, { id: 1, focused: true }]]),
    storage: {},
    scheduled: [],
    injected: [],
    sentMessages: [],
  };
  state.storage.fmData = { keepList: [] };

  const api = {
    runtime: {
      id: 'followers-manager-extension',
      getURL(path) { return 'chrome-extension://followers-manager-extension/' + path; },
      onMessage: events.runtimeMessage,
    },
    action: { onClicked: events.actionClicked },
    storage: {
      local: {
        async get(key) {
          if (Array.isArray(key)) return Object.fromEntries(key.map((name) => [name, clone(state.storage[name])]));
          return { [key]: clone(state.storage[key]) };
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) state.storage[key] = clone(value);
        },
      },
    },
    permissions: {
      async contains() {
        state.permissionChecks += 1;
        return state.permissionsAllowed;
      },
    },
    tabs: {
      onUpdated: events.tabsUpdated,
      onRemoved: events.tabsRemoved,
      onActivated: events.tabsActivated,
      async create(options) {
        state.tabsCreated += 1;
        const id = state.nextTabId++;
        const tab = { id, windowId: 1, active: options.active !== false, status: 'complete', url: options.url };
        state.tabs.set(id, tab);
        return clone(tab);
      },
      async get(id) {
        const tab = state.tabs.get(id);
        if (!tab) throw new Error('No such tab: ' + id);
        return clone(tab);
      },
      async update(id, options) {
        const tab = state.tabs.get(id);
        if (!tab) throw new Error('No such tab: ' + id);
        Object.assign(tab, options);
        return clone(tab);
      },
      async sendMessage(id, message) {
        state.sentMessages.push({ id, message: clone(message) });
      },
    },
    windows: {
      onFocusChanged: events.windowsFocusChanged,
      async get(id) {
        const window = state.windows.get(id);
        if (!window) throw new Error('No such window: ' + id);
        return clone(window);
      },
      async update(id, options) {
        const window = state.windows.get(id);
        if (!window) throw new Error('No such window: ' + id);
        Object.assign(window, options);
        return clone(window);
      },
    },
    scripting: {
      async executeScript(details) { state.injected.push(clone(details)); },
    },
  };

  return { api, events, state };
}

test('background service enforces supervised session ownership and terminal-state rules', async () => {
  const previousChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const timerCalls = [];
  const originalSetTimeout = globalThis.setTimeout;
  const { api: chrome, events, state } = makeChromeMock();
  Object.defineProperty(globalThis, 'chrome', { configurable: true, writable: true, value: chrome });

  try {
    await import('../src/background.js?background-test=' + Date.now());
    assert.equal(events.runtimeMessage.listeners.length, 1, 'runtime message handler should be registered');
    assert.equal(events.tabsUpdated.listeners.length, 1, 'tab update handler should be registered');
    assert.equal(events.tabsRemoved.listeners.length, 1, 'tab removal handler should be registered');
    assert.equal(events.tabsActivated.listeners.length, 1, 'tab activation handler should be registered');
    assert.equal(events.windowsFocusChanged.listeners.length, 1, 'window focus handler should be registered');

    const onMessage = events.runtimeMessage.listeners[0];
    const extensionId = chrome.runtime.id;
    const appSender = { id: extensionId, url: chrome.runtime.getURL('app.html') };
    const otherExtensionPage = { id: extensionId, url: chrome.runtime.getURL('other.html') };
    const baseStart = {
      type: 'fm:start',
      account: 'fixture',
      mode: 'cleanup',
      direction: 'following',
      authorization: 'written-permission',
      consent: true,
      queue: [{ id: 'member-1', username: 'alice', name: 'Synthetic Alice' }],
    };

    async function send(request, sender) {
      globalThis.setTimeout = (callback, delay) => {
        timerCalls.push({ callback, delay });
        return timerCalls.length;
      };
      try {
        return await new Promise((resolve) => {
          const returned = onMessage(request, sender, resolve);
          assert.equal(returned, true, 'handled session messages should keep the response channel open');
        });
      } finally {
        globalThis.setTimeout = originalSetTimeout;
      }
    }

    let response = await send({ ...baseStart, authorization: null }, appSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /written authorization/);
    assert.equal(state.permissionChecks, 0, 'invalid authorization should fail before permission lookup');

    response = await send({ ...baseStart, consent: false }, appSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /monitoring must be acknowledged/);

    response = await send(baseStart, otherExtensionPage);
    assert.equal(response.ok, false);
    assert.match(response.error, /Start sessions from the dashboard/);
    assert.equal(state.tabsCreated, 0);

    state.permissionsAllowed = false;
    response = await send(baseStart, appSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /site permission has not been granted/);
    assert.equal(state.tabsCreated, 0, 'permission denial must not open an X tab');

    state.permissionsAllowed = true;
    response = await send(baseStart, appSender);
    assert.equal(response.ok, true);
    assert.equal(response.session.status, 'ready');
    const sessionId = response.session.id;
    const tabId = response.session.tabId;
    assert.equal(state.tabsCreated, 1);
    assert.equal(state.tabs.get(tabId).url, 'https://x.com/fixture/following');
    assert.equal(timerCalls.length, 1, 'the test captures the delayed injection callback without running it');
    assert.equal(state.injected.length, 0, 'no real content script is executed');

    const ownedSender = {
      id: extensionId,
      url: 'https://x.com/fixture/following',
      tab: { id: tabId, url: 'https://x.com/fixture/following' },
    };
    const unrelatedTabSender = { ...ownedSender, tab: { id: tabId + 1000 } };

    response = await send({ type: 'fm:update', id: sessionId, current: true, message: 'Working on the selected profile.' }, unrelatedTabSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /does not own the session/);

    response = await send({ type: 'fm:update', id: 'stale-session-id', current: true }, ownedSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /no longer current/);

    response = await send({ type: 'fm:update', id: sessionId, current: true, message: 'Profile request submitted.' }, ownedSender);
    assert.equal(response.ok, true);
    assert.equal(response.session.current.username, 'alice');
    assert.equal(response.session.message, 'Profile request submitted.');

    response = await send({ type: 'fm:pause', id: sessionId, message: 'Paused for review.' }, ownedSender);
    assert.equal(response.ok, true);
    assert.equal(response.session.status, 'paused');

    response = await send(baseStart, appSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /Stop the existing session first/);
    assert.equal(state.tabsCreated, 1, 'a paused session prevents a second monitor tab');

    response = await send({ type: 'fm:guard', id: sessionId }, ownedSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /paused or no longer visible/);

    response = await send({ type: 'fm:resume', id: sessionId }, ownedSender);
    assert.equal(response.ok, true);
    assert.equal(response.session.status, 'running');

    state.tabs.get(tabId).active = false;
    response = await send({ type: 'fm:guard', id: sessionId }, ownedSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /paused or no longer visible/);
    state.tabs.get(tabId).active = true;
    state.windows.get(1).focused = false;
    response = await send({ type: 'fm:guard', id: sessionId }, ownedSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /paused or no longer visible/);
    state.windows.get(1).focused = true;

    state.storage.fmData.keepList = [{ id: 'member-1', username: 'alice' }];
    response = await send({ type: 'fm:guard', id: sessionId }, ownedSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /now on your keep list/);
    state.storage.fmData.keepList = [];

    response = await send({ type: 'fm:stop', id: sessionId, message: 'Stopped by user.' }, ownedSender);
    assert.equal(response.ok, true);
    assert.equal(response.session.status, 'stopped');

    response = await send({ type: 'fm:resume', id: sessionId }, ownedSender);
    assert.equal(response.ok, true);
    assert.equal(response.session.status, 'stopped', 'a terminal session must remain stopped when Resume is requested');

    response = await send({
      type: 'fm:update',
      id: sessionId,
      index: 0,
      result: { outcome: 'opened', detail: 'The submitted profile request completed.' },
    }, ownedSender);
    assert.equal(response.ok, true);
    assert.equal(response.session.status, 'stopped', 'recording a submitted request result must not restart a stopped session');
    assert.equal(response.session.results.length, 1);
    assert.equal(response.session.results[0].username, 'alice');
    assert.equal(response.session.index, 1);

    response = await send({
      type: 'fm:update',
      id: sessionId,
      index: 0,
      result: { outcome: 'opened', detail: 'Duplicate late result.' },
    }, ownedSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /Stale progress update/);
    const persisted = state.storage.fmSession;
    assert.equal(persisted.status, 'stopped');
    assert.equal(persisted.results.length, 1, 'the stale duplicate result must not be persisted');
    assert.equal(persisted.index, 1);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    if (previousChrome) Object.defineProperty(globalThis, 'chrome', previousChrome);
    else delete globalThis.chrome;
  }
});
