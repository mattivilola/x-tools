import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('supervised collection lifecycle enforces authorization and protects progress', async (t) => {
  const state = {}, listeners = {}, tabs = new Map(); let tabId = 0, permission = true;
  const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
  const id = 'followers-hero-test', base = `chrome-extension://${id}/`;
  globalThis.chrome = {
    runtime: { id, getURL: (path) => base + path, onStartup: event('startup'), onMessage: event('message') },
    permissions: { contains: async () => permission },
    storage: { local: {
      get: async (key) => ({ [key]: structuredClone(state[key]) }),
      set: async (data) => Object.assign(state, structuredClone(data)),
      clear: async () => Object.keys(state).forEach((key) => delete state[key]),
    } },
    action: { onClicked: event('action') }, scripting: { executeScript: async () => {} },
    tabs: { onUpdated: event('updated'), onRemoved: event('removed'),
      create: async ({ url }) => { const tab = { id: ++tabId, url, status: 'loading' }; tabs.set(tab.id, tab); return tab; },
      get: async (key) => tabs.get(key), sendMessage: async () => ({ ok: true }),
    },
  };
  await import(`../src/background.js?test=${Date.now()}`);
  const editor = { id, url: base + 'app.html' };
  const send = (message, sender = editor) => new Promise((resolve) => listeners.message(message, sender, resolve));
  const start = (extra = {}) => send({ type: 'FH_START', username: 'alex', target: 2, authorization: 'written-permission', ...extra });
  let collector;
  const batch = (extra = {}) => ({ type: 'FH_BATCH', id: state.job.id, followers: [{ username: 'one' }], ...extra });
  const control = (action) => send({ type: 'FH_CONTROL', id: state.job.id, action }, collector);
  await t.test('refuses content-script commands, absent authorization and missing site permission', async () => {
    assert.equal((await send({ type: 'FH_START', username: 'alex' }, { id, url: 'https://x.com/alex' })).ok, false);
    assert.equal((await start({ authorization: undefined })).ok, false);
    permission = false; assert.equal((await start()).ok, false); permission = true;
    assert.equal(state.job, undefined);
  });
  await t.test('opens in waiting state, refuses scans until the on-page Start', async () => {
    assert.equal((await start()).ok, true);
    assert.equal(state.job.status, 'waiting');
    collector = { id, tab: { id: state.job.tabId }, url: 'https://x.com/alex/followers' };
    assert.equal((await send(batch(), collector)).ok, false);
    assert.equal((await start({ username: 'other' })).ok, false);
    assert.equal((await control('start')).ok, true);
  });
  await t.test('rejects foreign tabs, account routes and stale IDs', async () => {
    assert.equal((await send(batch(), { ...collector, tab: { id: 99 } })).ok, false);
    assert.equal((await send(batch(), { ...collector, url: 'https://x.com/other/followers' })).ok, false);
    assert.equal((await send(batch({ id: 'stale' }), collector)).ok, false);
    assert.equal(state.job.followers.length, 0);
  });
  await t.test('saves progress and ignores batches after Pause', async () => {
    assert.equal((await send(batch(), collector)).ok, true);
    assert.equal((await send({ type: 'FH_CLEAR' })).ok, false);
    await control('pause');
    assert.equal((await send(batch({ followers: [{ username: 'late' }] }), collector)).ok, false);
    assert.equal(state.job.followers.length, 1);
  });
  await t.test('explicit Resume deduplicates and stops at the exact target', async () => {
    await control('start');
    assert.equal((await send(batch({ followers: [{ username: 'ONE' }, { username: 'two' }, { username: 'three' }] }), collector)).stop, true);
    assert.deepEqual(state.job.followers.map((f) => f.username), ['one', 'two']);
    assert.equal(state.job.status, 'complete');
    assert.equal((await control('start')).ok, false);
  });
  await t.test('Stop is terminal for on-page controls and startup pauses active work', async () => {
    await start({ target: 10 }); collector.tab.id = state.job.tabId;
    await control('start'); await control('stop');
    assert.equal(state.job.status, 'stopped'); assert.equal((await control('start')).ok, false);
    await start({ target: 10, resume: true }); await listeners.startup();
    assert.equal(state.job.status, 'paused');
    await send({ type: 'FH_CLEAR' }); assert.equal(state.job, undefined);
  });
  delete globalThis.chrome;
});
test('manifest grants no X access on install and has no automatic content script', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.deepEqual(manifest.optional_host_permissions, ['https://x.com/*', 'https://pbs.twimg.com/*']);
  assert.equal(manifest.permissions.includes('cookies'), false);
  assert.equal(manifest.permissions.includes('webRequest'), false);
});
