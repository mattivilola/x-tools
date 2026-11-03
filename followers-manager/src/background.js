import { makeSession, isKept, sessionPath, assertSessionUrl, TERMINAL } from './session.js';
import { mergeRecords, checkpointDue } from './performance.js';
const APP = chrome.runtime.getURL('app.html');
let chain = Promise.resolve();
const serial = (task) => { const result = chain.then(task); chain = result.catch(() => {}); return result; };
let cachedSession, lastCheckpoint = 0, kept;
const read = async () => cachedSession ??= (await chrome.storage.local.get('fmSession')).fmSession;
const readKeepList = async () => kept ??= (await chrome.storage.local.get('fmData')).fmData?.keepList || [];
const write = async (s, checkpoint = true) => {
  s.updatedAt = new Date().toISOString();
  if (checkpoint) {
    await chrome.storage.local.set({ fmSession: s });
    lastCheckpoint = Date.now();
  }
  cachedSession = s;
  return s;
};
// Progress/guard replies to the monitor omit immutable queues and the growing scan.
// Boot and durable storage checkpoints still contain the complete resumable session.
const reply = (s, sender) => {
  if (!sender.tab || sender.tab.id !== s.tabId) return s;
  const { records, queue, ...progress } = s;
  return { ...progress, recordCount: records.length };
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.fmData) kept = changes.fmData.newValue?.keepList || [];
  if (changes.fmSession) {
    const next = changes.fmSession.newValue;
    // Our older checkpoint event must not overwrite newer buffered scan progress.
    if (!next || next.id !== cachedSession?.id || Date.parse(next.updatedAt) > Date.parse(cachedSession.updatedAt)) cachedSession = next;
  }
});
const isApp = (sender) => sender.id === chrome.runtime.id && sender.url === APP;
async function focused(s) {
  const tab = await chrome.tabs.get(s.tabId);
  assertSessionUrl(s, tab.url);
  const window = await chrome.windows.get(tab.windowId);
  return tab.active && window.focused;
}
async function inject(tabId) {
  const s = await read();
  if (!s || s.tabId !== tabId || TERMINAL.has(s.status)) return;
  try {
    const tab = await chrome.tabs.get(tabId); assertSessionUrl(s, tab.url);
    if (tab.status !== 'complete') return;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/dom.js', 'src/runner.js'] });
    await chrome.tabs.sendMessage(tabId, { type: 'fm:boot', id: s.id });
  } catch (error) {
    await serial(async () => { const current = await read(); if (current?.id === s.id && !TERMINAL.has(current.status)) await write({ ...current, status: 'paused', message: error.message }); });
  }
}
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: APP }));
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (!request?.type?.startsWith('fm:')) return;
  serial(async () => {
    if (sender.id !== chrome.runtime.id) throw new Error('Unknown sender.');
    if (request.type === 'fm:start') {
      if (!isApp(sender)) throw new Error('Start sessions from the dashboard.');
      const old = await read();
      if (old && !TERMINAL.has(old.status)) throw new Error('Stop the existing session first.');
      const s = makeSession(request);
      if (!await chrome.permissions.contains({ origins: ['https://x.com/*'] })) throw new Error('X site permission has not been granted.');
      const keepList = await readKeepList();
      if (['cleanup','follow'].includes(s.mode) && s.queue.some((row) => isKept(row, keepList))) throw new Error('A selected account is now on your keep list.');
      const tab = await chrome.tabs.create({ url: `https://x.com${sessionPath(s)}`, active: true });
      s.tabId = tab.id; await write(s);
      // The update listener also covers pages that finish loading later.
      setTimeout(() => { void inject(tab.id); }, 300);
      return s;
    }
    const s = await read();
    if (!s || s.id !== request.id) throw new Error('This session is no longer current.');
    const fromTab = sender.tab?.id === s.tabId;
    if (!isApp(sender) && !fromTab) throw new Error('This tab does not own the session.');
    if (request.type === 'fm:show') {
      const tab = await chrome.tabs.get(s.tabId); await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(s.tabId, { active: true }); return s;
    }
    // Record an already submitted request's eventual result without restarting a stopped session.
    if (TERMINAL.has(s.status) && !(request.type === 'fm:update' && request.result && fromTab)) return s;
    if (request.type === 'fm:pause' || request.type === 'fm:stop') {
      return write({ ...s, status: request.type === 'fm:stop' ? 'stopped' : 'paused', message: String(request.message || (request.type === 'fm:stop' ? 'Stopped. No further actions will start.' : 'Paused. Resume from the live overlay.')).slice(0, 300) });
    }
    if (request.type === 'fm:resume') {
      if (!fromTab || !await focused(s)) throw new Error('Keep the live monitor visible and focused to resume.');
      return write({ ...s, status: 'running', message: 'Running under your supervision.' });
    }
    if (request.type === 'fm:guard') {
      if (!fromTab || s.status !== 'running') throw new Error('Session paused or no longer visible.');
      const isFocused = await focused(s); // Always verifies the owned tab and route, even in background mode.
      if (s.pauseOnFocusLoss !== false && !isFocused) throw new Error('Session paused or no longer visible.');
      const keepList = await readKeepList();
      const target = s.queue[s.index];
      if (['cleanup','follow'].includes(s.mode) && target && isKept(target, keepList)) throw new Error('This account is now on your keep list.');
      return s;
    }
    if (request.type === 'fm:update') {
      if (!fromTab) throw new Error('Only the monitor can publish progress.');
      const patch = {};
      if (typeof request.message === 'string') patch.message = request.message.slice(0, 300);
      if (request.current !== undefined) patch.current = s.queue[s.index] || null;
      if (request.recordChanges?.length && Array.isArray(request.recordChanges) && s.mode === 'scan') patch.records = mergeRecords(s.records, request.recordChanges.slice(0, 10000));
      if (!TERMINAL.has(s.status) && request.status && ['complete', 'error', 'paused'].includes(request.status)) patch.status = request.status;
      if (request.result && s.mode !== 'scan') {
        if (request.index !== s.index) throw new Error('Stale progress update.');
        const result = { username: s.queue[s.index].username, at: new Date().toISOString(), outcome: String(request.result.outcome).slice(0, 30), detail: String(request.result.detail || '').slice(0, 250) };
        if (s.mode === 'inspect') result.profile = request.result.profile;
        patch.results = [...s.results, result]; patch.index = s.index + 1; patch.current = null;
      }
      const next = { ...s, ...patch };
      return write(next, s.mode !== 'scan' || checkpointDue(lastCheckpoint, Date.now(), next.status));
    }
    if (request.type === 'fm:next-profile') {
      if (!fromTab || s.mode !== 'inspect' || s.status !== 'running') throw new Error('Inspection is paused.');
      if (s.index >= s.queue.length) return write({ ...s, status: 'complete', message: 'Profile inspection complete.' });
      const next = await write({ ...s, status: 'ready', message: 'Next profile ready. Press Begin reading in its monitor to continue.' });
      await chrome.tabs.update(s.tabId, { url: `https://x.com${sessionPath(s)}` }); return next;
    }
    throw new Error('Unknown session command.');
  }).then((session) => respond({ ok: true, session: reply(session, sender) }), (error) => respond({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.status === 'complete') void inject(tabId); });
chrome.tabs.onRemoved.addListener((tabId) => { void serial(async () => { const s = await read(); if (s?.tabId === tabId && !TERMINAL.has(s.status)) await write({ ...s, status: 'stopped', message: 'Monitor tab closed. Session stopped.' }); }); });
async function pauseIfAway() {
  await serial(async () => {
    const s = await read(); if (!s || s.status !== 'running' || s.pauseOnFocusLoss === false) return;
    let active = false; try { active = await focused(s); } catch { /* Changed page or closed tab. */ }
    if (!active) await write({ ...s, status: 'paused', message: 'Paused because the monitor lost focus. Return and press Resume.' });
  });
}
chrome.tabs.onActivated.addListener(() => { void pauseIfAway(); });
chrome.windows.onFocusChanged.addListener(() => { void pauseIfAway(); });
