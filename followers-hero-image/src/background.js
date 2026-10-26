import { username, normalizeFollowers, collectionPage, MAX_FOLLOWERS } from './core.js';
let queue = Promise.resolve();
const serialize = (fn) => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
const getJob = async () => (await chrome.storage.local.get('job')).job;
const save = (job) => chrome.storage.local.set({ job: { ...job, updatedAt: Date.now() } });
const isEditor = (sender) => sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('app.html');
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }));
async function showResults(job) {
  const url = chrome.runtime.getURL('app.html');
  let tab;
  if (Number.isInteger(job.editorTabId)) {
    const candidate = await chrome.tabs.get(job.editorTabId).catch(() => null);
    if (candidate?.url === url) tab = candidate;
  }
  if (!tab) tab = (await chrome.tabs.query({ url }))[0];
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    if (Number.isInteger(tab.windowId)) await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}
async function attach(tabId) {
  const job = await getJob();
  if (!job || job.tabId !== tabId || !['waiting', 'collecting', 'paused'].includes(job.status)) return;
  const tab = await chrome.tabs.get(tabId);
  if (!collectionPage(tab.url, job.username)) {
    await save({ ...job, status: 'paused', message: 'X opened another page. Sign in or check the account, then resume.' }); return;
  }
  // Reloading a tab never restarts collection without a fresh operator action.
  const next = { ...job, status: 'waiting', message: 'Use the on-page overlay to start. Keep this tab visible and focused.' };
  await save(next);
  await chrome.scripting.executeScript({ target: { tabId }, files: ['src/collector.js'] });
  await chrome.tabs.sendMessage(tabId, { type: 'FH_RUN', job: next });
}
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'complete') serialize(() => attach(tabId)).catch(async () => {
    const job = await getJob();
    if (job?.tabId === tabId && !['complete', 'stopped'].includes(job.status)) await save({ ...job, status: 'paused', message: 'Could not open the collector. Check the followers page and site permissions, then resume.' });
  });
});
chrome.tabs.onRemoved.addListener((tabId) => serialize(async () => {
  const job = await getJob();
  if (job?.tabId === tabId && !['complete', 'stopped'].includes(job.status)) await save({ ...job, status: 'paused', message: 'Followers tab closed. Progress saved.' });
}));
chrome.runtime.onStartup.addListener(() => serialize(async () => {
  const job = await getJob();
  if (job && ['collecting', 'waiting'].includes(job.status)) await save({ ...job, status: 'paused', message: 'Browser restarted. Progress saved; resume explicitly.' });
}));
async function handle(message, sender) {
  const job = await getJob();
  if (['FH_BATCH', 'FH_END', 'FH_CONTROL', 'FH_OPEN_EDITOR'].includes(message.type)) {
    if (sender.id !== chrome.runtime.id || sender.tab?.id !== job?.tabId || !collectionPage(sender.url, job.username) || message.id !== job.id || job.acknowledgement !== 'supervised-risk') return { ok: false };
    if (message.type === 'FH_OPEN_EDITOR') {
      if (job.status === 'collecting') await save({ ...job, status: 'paused', message: 'Paused to view your collected avatars.' });
      await showResults(job); return { ok: true };
    }
    if (message.type === 'FH_CONTROL') {
      if (['complete', 'stopped'].includes(job.status)) return { ok: false };
      const status = { start: 'collecting', pause: 'paused', stop: 'stopped' }[message.action];
      if (!status) return { ok: false };
      await save({ ...job, status, message: status === 'collecting' ? 'Supervised collection active. Keep watching the overlay.' : status === 'stopped' ? 'Stopped. Your partial collection is saved.' : 'Paused. Return to the followers tab and explicitly resume.' });
      if (status === 'stopped') await showResults(job).catch(() => {});
      return { ok: true, job: await getJob() };
    }
    if (job.status !== 'collecting') return { ok: false };
    if (message.type === 'FH_BATCH') {
      const followers = normalizeFollowers([...job.followers, ...normalizeFollowers(message.followers)]).slice(0, job.target);
      const done = followers.length >= job.target;
      const next = { ...job, followers, status: done ? 'complete' : 'collecting', message: done ? 'Requested count reached. Your collected avatars are ready to preview.' : 'Reading visible followers, then scrolling once every 3 seconds.' };
      await save(next);
      if (done) await showResults(next).catch(() => {});
      return { ok: true, stop: done, count: followers.length };
    }
    await save({ ...job, status: 'paused', message: 'No new people appeared, or the page changed. Check X before explicitly resuming. This may be a partial list.' });
    return { ok: true };
  }
  if (!isEditor(sender)) throw new Error('Open Followers Hero to manage collection.');
  if (message.type === 'FH_START') {
    if (message.acknowledgement !== 'supervised-risk') throw new Error('Acknowledge the X policy and account risk and continuous supervision before collection.');
    if (!await chrome.permissions.contains({ origins: ['https://x.com/*', 'https://pbs.twimg.com/*'] })) throw new Error('Grant the optional site permissions before collection.');
    if (job && ['collecting', 'waiting'].includes(job.status)) throw new Error('Pause or stop the existing collection first.');
    const handle = username(message.username);
    const target = Math.max(1, Math.min(MAX_FOLLOWERS, Math.floor(Number(message.target) || 10)));
    const followers = message.resume && job?.username === handle ? job.followers.slice(0, target) : [];
    const next = { id: crypto.randomUUID(), username: handle, target, followers, editorTabId: Number.isInteger(message.editorTabId) ? message.editorTabId : null, acknowledgement: 'supervised-risk', status: 'waiting', message: 'Opening X. Start explicitly in the on-page overlay.', tabId: null };
    await save(next);
    try {
      const tab = await chrome.tabs.create({ url: `https://x.com/${handle}/followers`, active: true });
      await save({ ...next, tabId: tab.id });
      if (tab.status === 'complete') await attach(tab.id);
    } catch (error) { await save({ ...next, status: 'paused', message: 'Could not open X. Progress saved.' }); throw error; }
    return { ok: true };
  }
  if (message.type === 'FH_PAUSE' || message.type === 'FH_STOP') {
    if (job) {
      const status = message.type === 'FH_STOP' ? 'stopped' : 'paused';
      await save({ ...job, status, message: `${status === 'stopped' ? 'Stopped' : 'Paused'}. Your progress is saved.` });
      if (job.tabId) await chrome.tabs.sendMessage(job.tabId, { type: message.type }).catch(() => {});
    }
    return { ok: true };
  }
  if (message.type === 'FH_CLEAR') {
    if (job && ['waiting', 'collecting'].includes(job.status)) throw new Error('Stop or pause collection before clearing data.');
    await chrome.storage.local.clear(); return { ok: true };
  }
  throw new Error('Unknown request.');
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  serialize(() => handle(message, sender)).then(reply).catch((error) => reply({ ok: false, error: error.message })); return true;
});
