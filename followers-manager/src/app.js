import { normalizeHandle, normalizeSnapshot, parseImport, compareSnapshots, buildReview, buildActionQueue, exportCsv, DEMO_SNAPSHOTS } from './core.js';
import { MAX_QUEUE, isKept } from './session.js';
import { PAGE_SIZE, actionBatch, minimumDuration } from './performance.js';
import { applyRelationships, normalizeRelationships } from './relationships.js';
const $ = (id) => document.getElementById(id);
const cleanData = () => ({ version: 1, snapshots: [], keepList: [] });
const actionIds = ['follow-verified', 'follow-all', 'unfollow-nonfollowers', 'unfollow-unverified-nonfollowers', 'unfollow-all'];
let data = cleanData(), session = null, rows = [], selected = new Set(), demo = false, currentAccount = '', prepared = null;
let page = 0, logSession = '', logCount = 0;
let completionShown = '';
let relationships = [];
const rowNodes = new Map();
const text = (tag, value, cls) => { const node = document.createElement(tag); node.textContent = value; if (cls) node.className = cls; return node; };
const date = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const announce = (value, error = false) => { $('notice').textContent = value; $('notice').classList.toggle('error', error); };
async function persist() { if (!demo) await chrome.storage.local.set({ fmData: data }); }
async function command(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type: `fm:${type}`, id: session?.id, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'Could not contact the extension.');
  session = response.session; renderSession(); return session;
}
const attempt = (fn) => async (...args) => { try { await fn(...args); } catch (error) { announce(error.message, true); } };
function snapshots() { return data.snapshots.filter((s) => s.account === currentAccount).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)); }
function latest() { return snapshots().at(-1); }
function currentView() { return demo ? latest() : applyRelationships(latest(), relationships); }
function previous() { const all = snapshots(); return all.slice(0, -1).reverse().find((s) => s.coverage === 'complete') || all.at(-2); }
function account() { const value = normalizeHandle($('account').value); if (demo || value === 'demo') throw new Error('Demo data cannot start a live session. Leave the demo and use your own X handle.'); return value; }
function addSnapshot(snapshot) {
  if (data.snapshots.length >= 100) throw new Error('Local snapshot limit reached (100). Export a backup before clearing older history.');
  const record = normalizeSnapshot(snapshot);
  if (data.snapshots.some((s) => s.id === record.id)) return false;
  data.snapshots.push(record); return true;
}
function render() {
  const points = snapshots(), current = points.at(-1), before = previous();
  const comparison = current && before ? compareSnapshots(before, current) : null;
  const view = currentView();
  rows = view ? buildReview(view, before, data.keepList) : [];
  $('total').textContent = current?.followerCount == null ? '—' : current.followerCount.toLocaleString();
  $('following-total').textContent = view ? `${view.following.length.toLocaleString()}${current.coverage === 'partial' ? ' (partial)' : ''}` : '—';
  $('lost-total').textContent = comparison?.comparable ? comparison.lost.length : 'Unknown';
  $('kept-total').textContent = data.keepList.length;
  $('coverage-info').textContent = current ? `Latest observation: ${date(current.observedAt)}. Source: ${current.source}. Coverage: ${current.coverage}. ${current.followers.length} follower records; ${current.following.length} following records.` : 'A first snapshot establishes your baseline. Later complete snapshots can reveal relationship changes.';
  $('comparison-warning').textContent = comparison?.warning || (!before ? 'Tracking starts with your first baseline. Import or scan a later observation to see changes.' : '');
  renderChart(points); renderRows(); renderSnapshots(); renderSession();
  updateSessionButtons();
  $('action-summary').textContent = current ? `${view.followers.length} observed followers; ${view.following.length} following in the local status view. Coverage: ${current.coverage}. Confirmed actions and observed relationship states update immediately; historical snapshots stay unchanged. Live checks run before each action.` : 'Scan or import your lists to prepare an action selection.';
}
function renderChart(points) {
  const window = Number($('window').value), cutoff = window ? Date.now() - window * 86400000 : 0;
  const entries = points.filter((s) => Date.parse(s.observedAt) >= cutoff && s.followerCount !== null);
  const chart = $('chart'); chart.replaceChildren();
  $('history-points').replaceChildren(...entries.map((p) => text('span', `${date(p.observedAt)}: ${p.followerCount.toLocaleString()}`)));
  if (!entries.length) { chart.setAttribute('aria-label', 'No follower counts available in this period'); $('delta').textContent = 'No measured counts in this period'; $('chart-description').textContent = 'Only actual observation dates are plotted. Unknown totals remain unknown.'; return; }
  const first = entries[0], last = entries.at(-1), delta = last.followerCount - first.followerCount;
  $('delta').textContent = entries.length > 1 ? `${delta >= 0 ? '+' : ''}${delta.toLocaleString()} between observed endpoints` : 'First measured observation';
  $('chart-description').textContent = `${date(first.observedAt)} to ${date(last.observedAt)}. ${entries.length} observations. Lines connect observations; gaps are not additional measurements.`;
  chart.setAttribute('aria-label', `${entries.length} follower count observations, from ${first.followerCount} to ${last.followerCount}.`);
  const min = Math.min(...entries.map((s) => s.followerCount)), max = Math.max(...entries.map((s) => s.followerCount));
  const start = Date.parse(first.observedAt), range = Date.parse(last.observedAt) - start || 1;
  const coordinates = entries.map((s) => [20 + ((Date.parse(s.observedAt) - start) / range) * 660, 140 - ((s.followerCount - min) / (max - min || 1)) * 115]);
  const ns = 'http://www.w3.org/2000/svg';
  const line = document.createElementNS(ns, 'polyline'); line.setAttribute('points', coordinates.map((p) => p.join(',')).join(' ')); line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#006cba'); line.setAttribute('stroke-width', '3'); chart.append(line);
  coordinates.forEach(([x, y], i) => { const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', '5'); circle.setAttribute('fill', '#006cba'); const title = document.createElementNS(ns, 'title'); title.textContent = `${date(entries[i].observedAt)}: ${entries[i].followerCount}`; circle.append(title); chart.append(circle); });
}
function visibleRows() {
  const filter = $('filter').value, query = $('search').value.trim().toLowerCase();
  return rows.filter((row) => {
    const matches = filter === 'all' || (filter === 'kept' && isKept(row, data.keepList)) || (filter === 'lost' && row.kind === 'lost') ||
      (filter === 'inactive' && row.reasons.some((r) => r.startsWith('No public post observed'))) ||
      (filter === 'nonfollower' && row.reasons.some((r) => r.startsWith('Does not appear'))) ||
      (filter === 'review' && row.reasons.some((r) => r.startsWith('No bio is available')));
    return matches && `${row.username} ${row.name}`.toLowerCase().includes(query);
  });
}
function pageRows() { return visibleRows().slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE); }
function renderRows() {
  const body = $('people'), filtered = visibleRows();
  page = Math.min(page, Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1));
  const nodes = [];
  for (const row of pageRows()) {
    const signature = JSON.stringify([row, isKept(row, data.keepList)]), cached = rowNodes.get(row.username);
    if (cached?.signature === signature) { cached.node.querySelector('input').checked = selected.has(row.username); nodes.push(cached.node); continue; }
    const tr = document.createElement('tr');
    const selectCell = document.createElement('td'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(row.username); checkbox.disabled = !row.canSelect || isKept(row, data.keepList); checkbox.setAttribute('aria-label', `Select @${row.username}`);
    if (checkbox.disabled) { selected.delete(row.username); checkbox.checked = false; }
    checkbox.addEventListener('change', () => { if (checkbox.checked) selected.add(row.username); else selected.delete(row.username); renderSelection(); }); selectCell.append(checkbox);
    const accountCell = document.createElement('td'), link = text('a', row.name || row.username, 'person-name'); link.href = `https://x.com/${row.username}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; accountCell.append(link, text('span', `@${row.username}`, 'handle'));
    if (row.bio) accountCell.append(text('span', row.bio, 'bio'));
    const evidence = document.createElement('td'); evidence.append(...(row.reasons.length ? row.reasons : ['No cleanup suggestion.']).map((reason) => text('span', reason, 'reason')));
    const keepCell = document.createElement('td'), keep = text('button', isKept(row, data.keepList) ? 'Kept' : 'Keep', 'secondary keep-button'); keep.setAttribute('aria-label', `${isKept(row, data.keepList) ? 'Unprotect' : 'Protect'} @${row.username}`); keep.setAttribute('aria-pressed', String(isKept(row, data.keepList)));
    keep.addEventListener('click', attempt(async () => { if (isKept(row, data.keepList)) data.keepList = data.keepList.filter((item) => !isKept(row, [item])); else data.keepList.push({ id: row.id, username: row.username }); selected.delete(row.username); await persist(); render(); })); keepCell.append(keep);
    tr.append(selectCell, accountCell, evidence, keepCell); nodes.push(tr);
    rowNodes.set(row.username, { signature, node: tr });
  }
  // Retain only the current page: filters never leave thousands of detached rows.
  for (const [username, entry] of rowNodes) if (!nodes.includes(entry.node)) rowNodes.delete(username);
  body.replaceChildren(...nodes);
  if (!body.children.length) { const tr = document.createElement('tr'), td = text('td', rows.length ? 'No accounts match this view.' : 'Import a following snapshot or try the synthetic demo.', 'empty'); td.colSpan = 4; tr.append(td); body.append(tr); }
  $('page-summary').textContent = filtered.length ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length} accounts · ${PAGE_SIZE} per page` : '0 accounts';
  $('previous-page').disabled = page === 0; $('next-page').disabled = (page + 1) * PAGE_SIZE >= filtered.length;
  renderSelection();
}
function renderSelection() {
  const allowed = new Set(rows.filter((r) => r.canSelect && !isKept(r, data.keepList)).map((r) => r.username)); selected = new Set([...selected].filter((s) => allowed.has(s)));
  $('selection-count').textContent = `${selected.size} selected`;
  $('cleanup-label').textContent = selected.size ? `${selected.size} accounts in your review selection.` : 'Build a review selection first.';
  $('review-cleanup').disabled = !selected.size || selected.size > MAX_QUEUE || demo;
  $('inspect').disabled = !selected.size || selected.size > MAX_QUEUE || demo;
  updateSessionButtons();
}
function renderSnapshots() {
  $('snapshots').replaceChildren(...snapshots().slice().reverse().map((s) => {
    const row = text('p', `${date(s.observedAt)} · ${s.source} · ${s.coverage} · ${s.followers.length} follower / ${s.following.length} following records `);
    if (s.coverage === 'partial' && s.followers.length && s.following.length) {
      const verify = text('button', 'Confirm full coverage', 'secondary keep-button');
      verify.addEventListener('click', attempt(async () => {
        if (demo) return;
        if (!confirm('Only confirm if you have independently verified BOTH full lists for this observation. A matching count or stalled scroll alone is insufficient. Confirm complete coverage?')) return;
        if ((s.followerCount !== null && s.followerCount !== s.followers.length) || (s.followingCount !== null && s.followingCount !== s.following.length)) throw new Error('Reported counts differ from the lists; this snapshot must stay partial.');
        s.coverage = 'complete'; s.followerCount ??= s.followers.length; s.followingCount ??= s.following.length; await persist(); render();
      })); row.append(verify);
    }
    return row;
  }));
}
function renderSession() {
  $('session').hidden = !session || demo;
  updateSessionButtons();
  if (!session || demo) return;
  $('session-title').textContent = `${session.mode} · ${session.scanReview && session.status === 'paused' ? 'needs review' : session.status} · @${session.account}`;
  $('session-info').textContent = `${session.mode === 'scan' ? `${session.records.length} observed accounts` : `${session.index}/${session.queue.length} processed`} — ${session.message}`;
  $('pause-session').disabled = session.status !== 'running'; $('stop-session').disabled = ['complete', 'stopped', 'error'].includes(session.status);
  $('save-scan').hidden = session.mode !== 'scan' || !session.records.length || session.status === 'running' || !!session.savedAt;
  if (session.mode !== 'scan' || session.status === 'running' || !session.records.length || session.savedAt) $('scan-save').hidden = true;
  if (logSession !== session.id || logCount > session.results.length) { $('session-log').replaceChildren(); logSession = session.id; logCount = 0; }
  $('session-log').append(...session.results.slice(logCount).map((r) => text('p', `${date(r.at)} · @${r.username}: ${r.outcome} — ${r.detail}`)));
  logCount = session.results.length;
}
function updateSessionButtons() {
  const busy = session && !['complete', 'stopped', 'error'].includes(session.status);
  for (const id of actionIds) $(id).disabled = !!busy || demo || !latest();
  for (const id of ['scan-followers', 'scan-following']) $(id).disabled = !!busy || demo;
  for (const id of ['inspect', 'review-cleanup']) $(id).disabled = !!busy || demo || !selected.size || selected.size > MAX_QUEUE;
}
function download(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function queue() {
  // Review sorting is for people; execution follows the observed list order so
  // the runner can continue down the list rather than wrap for each suggestion.
  const order = new Map((currentView()?.following || []).map((r, index) => [r.username, index]));
  return rows.filter((r) => selected.has(r.username) && r.canSelect && !isKept(r, data.keepList)).sort((a, b) => (order.get(a.username) ?? Infinity) - (order.get(b.username) ?? Infinity));
}
async function start(mode, direction, plan = prepared) {
  const own = account();
  if (currentAccount && currentAccount !== own) throw new Error('Switch the displayed account before starting a live session.');
  if (plan?.account && plan.account !== own) throw new Error('The account changed after you reviewed this selection. Review it again.');
  await command('start', { mode, account: own, direction, queue: mode === 'scan' ? [] : plan?.queue || queue(), action: plan?.action || null,
    batchSize: plan?.batchSize || 'all', pauseOnFocusLoss: $('pause-focus').checked, consent: ['cleanup', 'follow'].includes(mode), authorization: 'written-permission' });
}
function prepareStart(mode, direction, action = null) {
  if (session && !['complete', 'stopped', 'error'].includes(session.status)) throw new Error('Finish or Stop the current session before preparing another one.');
  const own = account();
  if (currentAccount && own !== currentAccount) throw new Error('Switch the displayed account before reviewing an action.');
  let selection = mode === 'scan' ? [] : queue(), warning = '';
  if (action) {
    if (!latest()) throw new Error('Scan or import your lists first.');
    const result = buildActionQueue(currentView(), action, data.keepList); selection = result.queue; warning = `${result.excluded} excluded. ${result.warning}`;
  }
  if (mode !== 'scan' && !selection.length) throw new Error(`No eligible accounts for this action. ${warning}`);
  prepared = { mode, direction, action, account: own, all: structuredClone(selection), queue: [], batchSize: 'all' };
  $('batch-size').value = 'all'; $('batch-options').hidden = !['cleanup', 'follow'].includes(mode);
  $('accept').checked = false; $('authorization').checked = false;
  $('pause-focus').checked = true; updateFocusNote();
  $('consent-title').textContent = mode === 'follow' ? 'Review follow-back selection' : mode === 'cleanup' ? 'Review unfollow selection' : mode === 'scan' ? 'Supervise this scan' : 'Supervise profile inspection';
  $('consent-coverage').textContent = warning;
  renderPrepared();
  $('consent').showModal();
}
function renderPrepared() {
  if (!prepared) return;
  const { mode } = prepared;
  prepared.batchSize = $('batch-size').value;
  const selection = prepared.queue = actionBatch(prepared.all, prepared.batchSize);
  $('consent-description').textContent = ['cleanup','follow'].includes(mode) ? `The extension will ${mode === 'follow' ? 'follow back' : 'unfollow'} ${selection.length} selected accounts, one at a time.${prepared.batchSize === '5' ? ' First 5 test: this session stops after this batch. This performs real account actions.' : ''} Review this fixed selection and monitor its progress.` : 'The extension will read rendered X pages. This session will not follow or unfollow anyone.';
  $('duration-estimate').textContent = ['cleanup','follow'].includes(mode) ? `Countdown estimate: ${minimumDuration(selection.length)}. Finding accounts, confirming results, pauses and background throttling add time.` : '';
  $('consent-list').replaceChildren(...selection.slice(0, 500).map((r) => text('li', `@${r.username} — ${r.reasons?.join('; ') || 'Selected by you'}`)));
  if (selection.length > 500) $('consent-list').append(text('li', `${selection.length - 500} more accounts in this fixed selection. Export review data or narrow your selection to inspect individuals.`));
}
$('batch-size').addEventListener('change', () => { $('accept').checked = false; renderPrepared(); });
function updateFocusNote() { $('focus-note').textContent = $('pause-focus').checked ? 'Switching tabs or windows pauses this session. Return to the monitor and press Resume to continue.' : 'This session can continue in a background tab. Keep monitoring its progress and return to use Pause or Stop. Browsers may slow down background work; this is not a guarantee of continuous execution.'; }
$('pause-focus').addEventListener('change', updateFocusNote);
$('export-action').addEventListener('click', attempt(() => { if (prepared?.queue) download('action-selection.csv', exportCsv(prepared.queue), 'text/csv'); }));
for (const action of ['follow-verified', 'follow-all', 'unfollow-nonfollowers', 'unfollow-unverified-nonfollowers', 'unfollow-all']) $(action).addEventListener('click', attempt(() => prepareStart(action.startsWith('follow-') ? 'follow' : 'cleanup', undefined, action)));
function saveScan() {
  $('scan-save').hidden = false; $('coverage').checked = false; $('reported-count').value = '';
  $('scan-summary').textContent = `${session.records.length} ${session.direction} records observed for @${session.account}. Scrolling stopping is not proof of completeness. An unchecked snapshot is saved as partial.`;
}
function showCompletion() {
  if (demo || session?.status !== 'complete' || completionShown === session.id) return;
  completionShown = session.id;
  currentAccount = session.account; $('account').value = currentAccount; selected.clear(); page = 0; render();
  if (session.mode === 'scan' && session.records.length && !session.savedAt) {
    saveScan(); announce('Scan finished. Review the observation below and choose Save snapshot.');
    $('save-results-title').focus();
  } else {
    $('history-details').open = true;
    announce(session.mode === 'scan' ? 'Scan complete. Saved observations are available below.' : `Session complete: ${session.index} accounts processed. Results are saved locally in session history.`);
    $('session').scrollIntoView({ block: 'start' });
  }
}
$('demo').addEventListener('click', attempt(async () => {
  if (demo) { data = (await chrome.storage.local.get('fmData')).fmData || cleanData(); demo = false; currentAccount = data.snapshots.at(-1)?.account || ''; $('demo').textContent = 'Explore the demo'; announce('Returned to your local history.'); }
  else { demo = true; data = { version: 1, snapshots: structuredClone(DEMO_SNAPSHOTS), keepList: [] }; currentAccount = DEMO_SNAPSHOTS[0].account; $('demo').textContent = 'Leave the demo'; announce('Synthetic demo only. Nothing is saved and no X pages or actions are opened.'); }
  selected.clear(); $('account').value = currentAccount; render();
}));
$('account').addEventListener('change', attempt(async () => { if (demo) throw new Error('Leave the demo before switching accounts.'); currentAccount = normalizeHandle($('account').value); selected.clear(); render(); }));
$('scan-followers').addEventListener('click', attempt(() => prepareStart('scan', 'followers')));
$('scan-following').addEventListener('click', attempt(() => prepareStart('scan', 'following')));
$('inspect').addEventListener('click', attempt(() => prepareStart('inspect')));
$('window').addEventListener('change', () => renderChart(snapshots()));
for (const id of ['filter', 'search']) $(id).addEventListener('input', () => { page = 0; renderRows(); });
for (const [id, change] of [['previous-page', -1], ['next-page', 1]]) $(id).addEventListener('click', () => { page = Math.max(0, page + change); renderRows(); $('people').closest('.table-wrap').scrollTop = 0; });
$('select-visible').addEventListener('click', () => { for (const row of pageRows()) if (row.canSelect && !isKept(row, data.keepList) && selected.size < MAX_QUEUE) selected.add(row.username); renderRows(); announce('Selected eligible accounts on this page. Selections on other pages are preserved.'); });
$('clear-selection').addEventListener('click', () => { selected.clear(); renderRows(); });
$('review-cleanup').addEventListener('click', attempt(() => prepareStart('cleanup')));
$('start-cleanup').addEventListener('click', attempt(async () => {
  if (!$('consent').querySelector('form').reportValidity() || !prepared) return;
  $('start-cleanup').disabled = true;
  try {
    const granted = await chrome.permissions.request({ origins: ['https://x.com/*'] });
    if (!granted) throw new Error('X site permission was declined. Offline history remains available.');
    const next = prepared; $('consent').close(); await start(next.mode, next.direction, next);
    announce('Session opened. Check its live monitor and press Begin when ready.');
  } finally { $('start-cleanup').disabled = false; }
}));
$('show-session').addEventListener('click', attempt(() => command('show')));
$('pause-session').addEventListener('click', attempt(() => command('pause')));
$('stop-session').addEventListener('click', attempt(() => command('stop')));
$('save-scan').addEventListener('click', saveScan);
$('cancel-save').addEventListener('click', () => { $('scan-save').hidden = true; });
$('confirm-save').addEventListener('click', attempt(async () => {
  if (!session || session.mode !== 'scan' || session.status === 'running') throw new Error('Pause the scan before saving.');
  if (demo) throw new Error('Leave demo mode before saving a live scan.');
  const count = $('reported-count').value === '' ? null : Number($('reported-count').value);
  if (count !== null && (!Number.isSafeInteger(count) || count < 0 || count < session.records.length)) throw new Error('The reported total must be an integer at least as large as the observed list.');
  if ($('coverage').checked && count !== null && count !== session.records.length) throw new Error('The reported total differs from the collected list. Save it as partial.');
  const last = data.snapshots.filter((s) => s.account === session.account).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)).at(-1);
  // Carrying the other direction forward would misrepresent its observation time. Keep both directions partial unless imported together.
  const direction = session.direction, complete = $('coverage').checked;
  const total = count ?? (complete ? session.records.length : null);
  const candidate = { account: session.account, observedAt: session.completedAt || session.updatedAt, source: 'browser-scan', coverage: 'partial', followers: direction === 'followers' ? session.records : [], following: direction === 'following' ? session.records : [], followerCount: direction === 'followers' ? total : null, followingCount: direction === 'following' ? total : null };
  // Pair only observations taken within 30 minutes, preserving conservative coverage if either was partial.
  if (last && last.source.startsWith('browser-scan') && Math.abs(Date.parse(last.observedAt) - Date.parse(candidate.observedAt)) < 1800000 && last[direction].length === 0) {
    candidate[direction === 'followers' ? 'following' : 'followers'] = last[direction === 'followers' ? 'following' : 'followers'];
    candidate[direction === 'followers' ? 'followingCount' : 'followerCount'] = last[direction === 'followers' ? 'followingCount' : 'followerCount'];
    candidate.coverage = complete && last.source === 'browser-scan-verified' ? 'complete' : 'partial';
  }
  candidate.source = complete ? 'browser-scan-verified' : 'browser-scan';
  addSnapshot(candidate); currentAccount = session.account; $('account').value = currentAccount; await persist(); await command('saved'); $('scan-save').hidden = true; selected.clear(); render(); announce('Snapshot saved locally. Coverage and counts are shown beside the observation.');
}));
$('import').addEventListener('change', attempt(async (event) => {
  const file = event.target.files[0]; if (!file) return;
  if (demo) throw new Error('Leave the demo before importing your data.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Import is limited to 8 MB. Select only the relevant archive data file.');
  const own = normalizeHandle($('account').value), observed = $('observed').value ? new Date($('observed').value).toISOString() : new Date().toISOString();
  const snapshot = parseImport(await file.text(), own, $('direction').value, observed);
  if (snapshot.account !== own) throw new Error('The imported snapshot belongs to a different account. Switch accounts first.');
  const prior = data.snapshots.filter((s) => s.account === own && s.observedAt === snapshot.observedAt && s.source === snapshot.source).at(-1);
  if (prior && snapshot.coverage === 'partial' && prior.coverage === 'partial') {
    if (!snapshot.followers.length) snapshot.followers = prior.followers;
    if (!snapshot.following.length) snapshot.following = prior.following;
    // Recalculate identity after pairing selected files from the same export observation.
    snapshot.id = ''; Object.assign(snapshot, normalizeSnapshot(snapshot));
  }
  const added = addSnapshot(snapshot); currentAccount = own; await persist(); selected.clear(); render(); announce(added ? 'Snapshot imported. Archive lists default to partial; review the coverage notes.' : 'This snapshot is already saved.'); event.target.value = '';
}));
$('backup').addEventListener('click', () => download('followers-manager-backup.json', JSON.stringify({ ...data, relationships: demo ? [] : relationships }, null, 2), 'application/json'));
$('csv').addEventListener('click', () => download('following-review.csv', exportCsv(rows), 'text/csv'));
$('restore').addEventListener('change', attempt(async (event) => {
  const file = event.target.files[0]; if (!file) return;
  if (demo || (session && !['stopped', 'complete', 'error'].includes(session.status))) throw new Error('Leave demo mode and stop the current session before restoring a backup.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Backup import is limited to 8 MB.');
  const backup = JSON.parse(await file.text());
  if (backup.version !== 1 || !Array.isArray(backup.snapshots) || backup.snapshots.length > 100 || !Array.isArray(backup.keepList) || backup.keepList.length > 10000) throw new Error('Unsupported backup.');
  const restored = backup.snapshots.map(normalizeSnapshot), keeps = backup.keepList.map((item) => ({ id: item.id && /^\d{1,25}$/.test(String(item.id)) ? String(item.id) : null, username: normalizeHandle(typeof item === 'string' ? item : item.username) }));
  const restoredRelationships = normalizeRelationships(backup.relationships || []);
  // Merge rather than replace existing history or keep decisions.
  const combined = new Map([...data.snapshots, ...restored].map((s) => [s.id, s]));
  if (combined.size > 100) throw new Error('Restoring would exceed the 100-snapshot local limit.');
  await command('restore-relationships', { relationships: restoredRelationships });
  relationships = (await chrome.storage.local.get('fmRelationships')).fmRelationships || [];
  data.snapshots = [...combined.values()]; data.keepList = [...data.keepList, ...keeps]; await persist(); currentAccount = data.snapshots.at(-1)?.account || currentAccount; $('account').value = currentAccount; render(); announce('Backup merged into local history.'); event.target.value = '';
}));
$('clear-data').addEventListener('click', attempt(async () => {
  if (demo) throw new Error('Leave demo mode before clearing saved history.');
  if (session && !['complete', 'stopped', 'error'].includes(session.status)) throw new Error('Stop the live session before clearing local history.');
  if (!confirm('Clear saved snapshots, keep list and the latest session log? Export a backup first if you want to retain them. This does not change X.')) return;
  data = cleanData(); session = null; relationships = []; selected.clear(); await chrome.storage.local.remove(['fmData', 'fmSession', 'fmRelationships']); render(); announce('Local history cleared. Exported files are unchanged.');
}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.fmRelationships) relationships = changes.fmRelationships.newValue || [];
  if (changes.fmSession) { session = changes.fmSession.newValue || null; renderSession(); showCompletion(); }
  if (changes.fmData && !demo) { data = changes.fmData.newValue || cleanData(); render(); }
  else if (changes.fmRelationships && !demo) render();
});
// Profile inspection enriches the latest record without fabricating missing activity.
const enriched = new Set();
async function enrichInspection(s) {
  if (demo || s?.mode !== 'inspect') return;
  const current = data.snapshots.filter((p) => p.account === s.account).sort((a,b) => Date.parse(a.observedAt)-Date.parse(b.observedAt)).at(-1); if (!current) return;
  let changed = false;
  for (const r of s.results) { const key = `${s.id}:${r.username}`; if (enriched.has(key) || !r.profile) continue; const row = current.following.find((p) => p.username === r.username && (!p.id || p.id === r.profile.id)); if (row) { Object.assign(row, r.profile); changed = true; } enriched.add(key); }
  if (changed) { await persist(); render(); }
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.fmSession?.newValue?.mode === 'inspect') void attempt(() => enrichInspection(changes.fmSession.newValue))(); });
async function init() {
  const reconciled = await chrome.runtime.sendMessage({ type: 'fm:reconcile' });
  if (!reconciled?.ok) throw new Error(reconciled?.error || 'Could not recover local relationship status.');
  const saved = await chrome.storage.local.get(['fmData', 'fmSession', 'fmRelationships']); data = saved.fmData || cleanData(); session = saved.fmSession || null; relationships = saved.fmRelationships || [];
  currentAccount = data.snapshots.at(-1)?.account || session?.account || ''; $('account').value = currentAccount;
  $('observed').value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  render(); showCompletion(); await enrichInspection(session);
}
void attempt(init)();
