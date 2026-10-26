import { DEFAULT_SETTINGS, settings, normalizeFollowers, demoFollowers } from './core.js';
import { renderPoster } from './renderer.js';

const $ = (id) => document.getElementById(id);
const extension = Boolean(globalThis.chrome?.runtime?.id);
const keys = Object.keys(DEFAULT_SETTINGS);
let config = { ...DEFAULT_SETTINGS }, imported = [], source = 'demo', job = null;
let generation = 0, renderPromise = Promise.resolve(), renderTimer;
let cacheEpoch = 0;
const images = new Map();
const people = () => source === 'demo' ? demoFollowers() : source === 'collected' ? job?.followers || [] : imported;
const store = async (data) => { if (extension) await chrome.storage.local.set(data); };
const notify = (message) => { $('status').textContent = message; };
async function send(message) {
  if (!extension) throw new Error('Load this folder as an unpacked extension to use supervised collection.');
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'The extension did not respond. Reload it and try again.');
  return response;
}
function syncControls() { keys.forEach((key) => { if ($(key)) $(key).value = config[key]; }); }
function updateStatus() {
  const busy = job && ['collecting', 'waiting'].includes(job.status);
  $('collect').disabled = Boolean(busy);
  $('pause').hidden = !busy;
  $('stop').hidden = !job || ['stopped', 'complete'].includes(job.status);
  $('resume').hidden = !job || job.status !== 'paused';
  $('use-collected').hidden = !job?.followers?.length || source === 'collected';
  $('count').textContent = source === 'demo' ? 'Demo community' : `${people().length.toLocaleString()} ${source === 'collected' ? 'collected' : 'imported'} people`;
  notify(source === 'demo' ? 'Try the editor with 144 illustrated avatars.' : source === 'collected' ? job?.message || 'Ready.' : 'Imported on this device. Ready to design.');
  $('preview-label').textContent = source === 'demo' ? 'Demo preview' : source === 'collected' ? `@${job?.username} / ${job?.status}` : 'Your imported community';
}
async function loadImage(data, remote) {
  if (data.startsWith('https:') && !remote) return null;
  if (images.has(data)) return images.get(data);
  if (data.startsWith('https:')) {
    const epoch = cacheEpoch;
    try {
      const response = await fetch(data, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(12000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/') || Number(response.headers.get('content-length')) > 4_000_000) return null;
      const blob = await response.blob(); if (blob.size > 4_000_000) return null;
      const image = await createImageBitmap(blob, { resizeWidth: 128, resizeHeight: 128 });
      if (epoch !== cacheEpoch) { image.close(); return null; }
      images.set(data, image); return image;
    } catch { return null; }
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => { images.set(data, image); resolve(image); };
    image.onerror = () => resolve(null);
    image.src = data;
  });
}
async function draw() {
  const version = ++generation, list = people();
  const currentConfig = { ...config }, currentSource = source;
  $('png').disabled = $('jpeg').disabled = true;
  renderPoster($('poster'), list, currentConfig, images, currentSource === 'demo');
  $('dimensions').textContent = `${$('poster').width} × ${$('poster').height}`;
  const urls = [...new Set(list.map((person) => person.avatar).filter(Boolean))];
  let cursor = 0;
  const remote = currentSource === 'collected' && job?.authorization === 'written-permission';
  await Promise.all(Array.from({ length: Math.min(6, urls.length) }, async () => {
    while (cursor < urls.length && version === generation) await loadImage(urls[cursor++], remote);
  }));
  if (version !== generation) return;
  renderPoster($('poster'), list, currentConfig, images, currentSource === 'demo');
  const missing = list.filter((person) => !images.has(person.avatar)).length;
  $('render-status').textContent = currentSource === 'demo' ? 'Illustrated demo. Import your own photos to make it personal.' : missing ? `Ready. ${missing} unavailable avatar${missing === 1 ? '' : 's'} shown as initials.` : 'Ready to save. Full resolution, no watermark.';
  $('png').disabled = $('jpeg').disabled = false;
}
function redraw() {
  clearTimeout(renderTimer); generation++;
  $('png').disabled = $('jpeg').disabled = true;
  renderTimer = setTimeout(() => { renderPromise = draw().catch((error) => { $('render-status').textContent = error.message; }); }, 150);
}
async function choose(next) { await store({ source: next }); source = next; updateStatus(); redraw(); }
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
for (const key of keys) $(key)?.addEventListener('input', async () => {
  config = settings(Object.fromEntries(keys.map((name) => [name, $(name)?.value ?? config[name]])));
  try { await store({ settings: config }); redraw(); } catch { notify('Could not save settings. Free some extension storage and try again.'); }
});
$('demo').addEventListener('click', () => choose('demo').catch((error) => notify(error.message)));
async function startCollection(resume = false) {
  if (!extension) throw new Error('Load this folder as an unpacked extension to use supervised collection.');
  if (!$('authorization').checked) throw new Error('Confirm your written authorization from X and continuous supervision before using website collection.');
  const handle = resume ? job.username : $('username').value.trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error('Enter a valid X username.');
  if (!resume && job?.followers?.length && !confirm('Replace the current collection? Export JSON first if you want to keep it.')) return;
  const granted = await chrome.permissions.request({ origins: ['https://x.com/*', 'https://pbs.twimg.com/*'] });
  if (!granted) throw new Error('Site permission was declined. You can still use local photos and JSON.');
  await send({ type: 'FH_START', username: handle, target: resume ? job.target : $('target').value, resume, authorization: 'written-permission' });
  config.username = handle; $('authorization').checked = false;
  syncControls(); await store({ settings: config }); await choose('collected');
}
$('collect-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await startCollection(); } catch (error) { notify(error.message); } });
$('resume').addEventListener('click', async () => { try { await startCollection(true); } catch (error) { notify(error.message); } });
for (const action of ['pause', 'stop']) $(action).addEventListener('click', async () => { try { await send({ type: `FH_${action.toUpperCase()}` }); } catch (error) { notify(error.message); } });
$('use-collected').addEventListener('click', () => choose('collected').catch((error) => notify(error.message)));
async function applyImport(next, nextConfig = config, demo = false) {
  if (!next.length) throw new Error('No valid people found. Each JSON record needs a username.');
  if (JSON.stringify(next).length > 5_000_000) throw new Error('The collection is too large. Use fewer or smaller photos (5 MB maximum after import).');
  const nextSource = demo ? 'demo' : 'imported';
  // Commit storage before replacing the active collection so quota failures preserve it.
  await store({ imported: next, settings: nextConfig, source: nextSource });
  imported = next; config = nextConfig; source = nextSource;
  cacheEpoch++; images.forEach((image) => image.close?.()); images.clear(); syncControls(); updateStatus(); redraw();
}
$('import').addEventListener('change', async (event) => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 6_000_000) throw new Error('Choose a JSON file smaller than 6 MB.');
    const data = JSON.parse(await file.text());
    await applyImport(normalizeFollowers(Array.isArray(data) ? data : data?.followers), data?.settings ? settings(data.settings) : config, data?.demo === true);
  } catch (error) { notify(`Import failed: ${error.message}`); }
  finally { event.target.value = ''; }
});
async function photoRecord(file, index) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20_000_000) throw new Error('Use PNG, JPEG or WebP photos under 20 MB each.');
  const bitmap = await createImageBitmap(file, { resizeWidth: 128, resizeHeight: 128, resizeQuality: 'high' });
  try {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, 96, 96);
    return { username: `person_${index + 1}`, name: file.name.replace(/\.[^.]+$/, '').slice(0, 80), avatar: canvas.toDataURL('image/jpeg', .75) };
  } finally { bitmap.close(); }
}
$('photos').addEventListener('change', async (event) => {
  const files = [...event.target.files]; if (!files.length) return;
  $('photo-label').textContent = 'Preparing photos…';
  try {
    if (files.length > 500) throw new Error('Choose up to 500 photos per collection.');
    const next = [];
    // Decode one at a time to keep large local photo imports bounded in memory.
    for (const [i, file] of files.entries()) next.push(await photoRecord(file, i));
    await applyImport(next);
  } catch (error) { notify(`Photo import failed: ${error.message}`); }
  finally { $('photo-label').textContent = 'Import photos'; event.target.value = ''; }
});
$('export').addEventListener('click', () => download(new Blob([JSON.stringify({ version: 1, demo: source === 'demo', exportedAt: new Date().toISOString(), settings: config, followers: people() }, null, 2)], { type: 'application/json' }), `followers-hero-${source}.json`));
for (const format of ['png', 'jpeg']) $(format).addEventListener('click', async () => {
  await renderPromise;
  $('poster').toBlob((blob) => {
    if (blob) download(blob, `followers-hero-${source}.${format === 'jpeg' ? 'jpg' : format}`);
    else $('render-status').textContent = 'Could not save this poster. Try standard resolution.';
  }, `image/${format}`, .95);
});
$('clear').addEventListener('click', () => {
  if (job && ['waiting', 'collecting'].includes(job.status)) { notify('Stop or pause collection before clearing data.'); return; }
  $('clear-dialog').showModal();
});
$('cancel-clear').addEventListener('click', () => $('clear-dialog').close());
$('confirm-clear').addEventListener('click', async () => {
  try {
    if (extension) await send({ type: 'FH_CLEAR' });
    generation++; cacheEpoch++; imported = []; job = null; config = { ...DEFAULT_SETTINGS }; images.forEach((image) => image.close?.()); images.clear();
    syncControls(); await choose('demo'); $('clear-dialog').close();
  } catch (error) { notify(error.message); }
});
async function init() {
  if (extension) {
    const saved = await chrome.storage.local.get(['settings', 'imported', 'source', 'job']);
    config = settings(saved.settings); imported = normalizeFollowers(saved.imported || []);
    job = saved.job || null;
    source = ['imported', 'collected'].includes(saved.source) ? saved.source : 'demo';
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.job) { job = changes.job.newValue || null; updateStatus(); if (source === 'collected') redraw(); }
    });
  }
  syncControls(); updateStatus(); redraw();
}
init().catch((error) => notify(error.message));
