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
    storageChanged: makeEvent(),
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
    writes: 0,
    removedTabs: [],
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
      onChanged: events.storageChanged,
      local: {
        async get(key) {
          if (Array.isArray(key)) return Object.fromEntries(key.map((name) => [name, clone(state.storage[name])]));
          return { [key]: clone(state.storage[key]) };
        },
        async set(values) {
          state.writes++;
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { oldValue: clone(state.storage[key]), newValue: clone(value) };
            state.storage[key] = clone(value);
          }
          await events.storageChanged.emit(changes, 'local');
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
      async query(options) { return [...state.tabs.values()].filter((tab) => tab.url === options.url).map(clone); },
      async remove(id) { state.removedTabs.push(id); state.tabs.delete(id); await events.tabsRemoved.emit(id); },
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

    // Explicit background mode skips only the focus requirement, never route/ownership checks.
    await chrome.storage.local.set({ fmSession: { ...state.storage.fmSession, pauseOnFocusLoss: false, updatedAt: new Date(Date.now() + 1).toISOString() } });
    state.windows.get(1).focused = false;
    response = await send({ type: 'fm:guard', id: sessionId }, ownedSender);
    assert.equal(response.ok, true);
    state.tabs.get(tabId).url = 'https://x.com/someone/following';
    response = await send({ type: 'fm:guard', id: sessionId }, ownedSender);
    assert.equal(response.ok, false); assert.match(response.error, /page changed/);
    state.tabs.get(tabId).url = 'https://x.com/fixture/following';
    response = await send({ type: 'fm:pause', id: sessionId }, ownedSender);
    response = await send({ type: 'fm:resume', id: sessionId }, ownedSender);
    assert.equal(response.ok, false, 'Resume still requires the focused monitor');
    state.windows.get(1).focused = true;
    await send({ type: 'fm:resume', id: sessionId }, ownedSender);
    await chrome.storage.local.set({ fmSession: { ...state.storage.fmSession, pauseOnFocusLoss: true, updatedAt: new Date(Date.now() + 1).toISOString() } });

    await chrome.storage.local.set({ fmData: { keepList: [{ id: 'member-1', username: 'alice' }] } });
    response = await send({ type: 'fm:guard', id: sessionId }, ownedSender);
    assert.equal(response.ok, false);
    assert.match(response.error, /now on your keep list/);
    await chrome.storage.local.set({ fmData: { keepList: [] } });

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

    response = await send({ ...baseStart, mode: 'follow', action: 'follow-verified', queue: [{ id:'member-2', username:'bruno', verified:true }] }, appSender);
    assert.equal(response.ok, true, 'a terminal previous job allows a new follow-back session');
    assert.equal(response.session.status, 'ready');
    assert.equal(response.session.mode, 'follow');
    assert.equal(state.tabs.get(response.session.tabId).url, 'https://x.com/fixture/followers');
    assert.equal(response.session.queue[0].requireVerified, true);
    await send({ type: 'fm:stop', id: response.session.id }, appSender);

    response = await send({ ...baseStart, mode: 'scan', queue: [] }, appSender);
    const scanId = response.session.id, scanSender = { ...ownedSender, tab: { id: response.session.tabId } };
    await send({ type: 'fm:resume', id: scanId }, scanSender);
    const baseline = state.writes, originalNow = Date.now;
    try {
      const clock = originalNow(); Date.now = () => clock;
      response = await send({ type: 'fm:update', id: scanId, recordChanges: [{ username: 'alice', bio: 'first' }] }, scanSender);
      assert.equal(state.writes, baseline, 'scan deltas buffer between checkpoints');
      assert.equal(response.session.recordCount, 1); assert.equal(response.session.records, undefined); assert.equal(response.session.queue, undefined);
      Date.now = () => clock + 5001;
      await send({ type: 'fm:update', id: scanId, recordChanges: [{ username: 'alice', bio: 'new' }, { username: 'bruno' }] }, scanSender);
      assert.equal(state.writes, baseline + 1, 'periodic checkpoint persists merged deltas');
      assert.equal(state.storage.fmSession.records.length, 2); assert.equal(state.storage.fmSession.records[0].bio, 'new');
      await send({ type: 'fm:update', id: scanId, recordChanges: [{ username: 'carl' }] }, scanSender);
      assert.equal(state.storage.fmSession.records.length, 2);
      await send({ type: 'fm:pause', id: scanId }, appSender);
      assert.equal(state.storage.fmSession.records.length, 3, 'Pause flushes buffered records');
      await send({ type: 'fm:saved', id: scanId }, appSender);
      assert.ok(state.storage.fmSession.savedAt);
      await send({ type: 'fm:resume', id: scanId }, scanSender);
      assert.equal(state.storage.fmSession.savedAt, null, 'resuming a saved partial scan makes its new observation available to save again');
      await send({ type: 'fm:update', id: scanId, recordChanges: [{ username: 'dora' }] }, scanSender);
      await send({ type: 'fm:stop', id: scanId }, appSender);
      assert.equal(state.storage.fmSession.records.length, 4, 'Stop flushes buffered records');
      await send({ type: 'fm:update', id: scanId, recordChanges: [{ username: 'late' }] }, scanSender);
      assert.equal(state.storage.fmSession.records.length, 4, 'late deltas cannot alter a stopped scan');
    } finally { Date.now = originalNow; }

    // Closing a dashboard requires a replacement; only the extension-owned X tab closes.
    response = await send({ ...baseStart, mode: 'scan', queue: [] }, appSender);
    const completedScanId = response.session.id, completedTab = response.session.tabId;
    const completedSender = { ...ownedSender, tab: { id: completedTab } };
    await send({ type: 'fm:resume', id: completedScanId }, completedSender);
    response = await send({ type: 'fm:update', id: completedScanId, recordChanges: [{ username: 'alice' }], status: 'complete' }, completedSender);
    assert.equal(response.ok, false, 'idle scanning cannot declare completion automatically');
    await send({ type: 'fm:update', id: completedScanId, recordChanges: [{ username: 'alice' }], status: 'paused', scanReview: 'stalled' }, completedSender);
    assert.equal(state.storage.fmSession.status, 'paused'); assert.equal(state.tabs.has(completedTab), true, 'uncertain scans keep the monitor open');
    assert.equal((await send({ type: 'fm:finish-scan', id: completedScanId }, appSender)).ok, false);
    response = await send({ type: 'fm:resume', id: completedScanId, autoRetry: true }, completedSender);
    assert.equal(response.session.scanRetriesRemaining, 3);
    for (let left = 2; left >= 0; left--) {
      response = await send({ type: 'fm:update', id: completedScanId, retryUsed: true }, completedSender);
      assert.equal(response.session.scanRetriesRemaining, left);
    }
    assert.equal((await send({ type: 'fm:update', id: completedScanId, retryUsed: true }, completedSender)).ok, false, 'retry budget is bounded');
    await send({ type: 'fm:pause', id: completedScanId, message: 'X restriction appeared.' }, completedSender);
    assert.equal((await send({ type: 'fm:resume', id: completedScanId, autoRetry: true }, completedSender)).ok, false, 'Auto Retry never resumes an ordinary restriction pause');
    await send({ type: 'fm:resume', id: completedScanId }, completedSender);
    await send({ type: 'fm:update', id: completedScanId, status: 'paused', scanReview: 'stalled' }, completedSender);
    response = await send({ type: 'fm:finish-scan', id: completedScanId }, completedSender);
    assert.equal(response.ok, true); assert.equal(state.storage.fmSession.status, 'complete');
    assert.equal(state.storage.fmSession.records.length, 1, 'results are durable before closing the processing tab');
    assert.equal(state.removedTabs.includes(completedTab), true);
    const dashboards = [...state.tabs.values()].filter((tab) => tab.url === chrome.runtime.getURL('app.html'));
    assert.equal(dashboards.length, 1, 'a closed dashboard is replaced');
    const createdBeforeReturn = state.tabsCreated;
    await send({ type: 'fm:return', id: completedScanId }, appSender);
    assert.equal(state.tabsCreated, createdBeforeReturn, 'return reuses an existing dashboard');
    assert.equal((await send({ type: 'fm:saved', id: completedScanId }, completedSender)).ok, false);
    await send({ type: 'fm:saved', id: completedScanId }, appSender);
    assert.ok(state.storage.fmSession.savedAt, 'saving is recorded without deleting collected records');

    response = await send({ ...baseStart, mode: 'scan', queue: [] }, appSender);
    const changedId = response.session.id, changedTab = response.session.tabId;
    await send({ type: 'fm:resume', id: changedId }, { ...ownedSender, tab: { id: changedTab } });
    state.tabs.get(changedTab).url = 'https://x.com/home';
    const changedSender = { ...ownedSender, tab: { id: changedTab } };
    await send({ type: 'fm:update', id: changedId, status: 'paused', scanReview: 'stalled' }, changedSender);
    await send({ type: 'fm:finish-scan', id: changedId }, changedSender);
    assert.equal(state.tabs.has(changedTab), true, 'a processing tab navigated elsewhere is never closed');

    response = await send({ ...baseStart, action: 'unfollow-unverified-nonfollowers' }, appSender);
    assert.equal(response.ok, true, 'new cleanup action is supported');
    assert.equal((await send({ type: 'fm:update', id: response.session.id, status: 'complete' }, { ...ownedSender, tab: { id: response.session.tabId } })).ok, false, 'unfinished actions cannot claim completion');
    const stoppedId = response.session.id, stoppedSender = { ...ownedSender, tab: { id: response.session.tabId } };
    await send({ type: 'fm:stop', id: stoppedId }, appSender);
    await send({ type: 'fm:update', id: stoppedId, index: 0, result: { outcome: 'confirmed', detail: 'X now displays a Follow button.' } }, stoppedSender);
    assert.equal(state.storage.fmSession.status, 'stopped');
    assert.equal(state.storage.fmRelationships.find((r) => r.username === 'alice').isFollowing, false, 'late confirmed results update relationship status after Stop');
    response = await send({ ...baseStart, mode: 'follow', action: 'follow-all' }, appSender);
    const immediateId = response.session.id, immediateSender = { ...ownedSender, tab: { id: response.session.tabId } };
    await send({ type: 'fm:update', id: immediateId, index: 0, result: { outcome: 'confirmed' } }, immediateSender);
    assert.equal(state.storage.fmRelationships.find((r) => r.username === 'alice').isFollowing, true, 'confirmed status persists before the session completes');
    await send({ type: 'fm:stop', id: immediateId }, appSender);
    const evidenceTime = state.storage.fmRelationships[0].observedAt;
    await send({ type: 'fm:restore-relationships', relationships: [{ account: 'fixture', username: 'alice', id: 'member-1', isFollowing: false, observedAt: '2020-01-01T00:00:00Z' }] }, appSender);
    assert.equal(state.storage.fmRelationships[0].observedAt, evidenceTime, 'restoring old evidence cannot roll status back');
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    if (previousChrome) Object.defineProperty(globalThis, 'chrome', previousChrome);
    else delete globalThis.chrome;
  }
});
