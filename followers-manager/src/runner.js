/* Runs only in a dedicated, extension-owned X tab. No cookies, private API, or request interception. */
(() => {
  if (globalThis.__followersManager) return;
  globalThis.__followersManager = true;
  let session, host, shadow, busy = false, version = 0, countdown = '', pending = false, localControl = '';
  const seen = new Map();
  const terminal = new Set(['complete', 'stopped', 'error']);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const handle = (value) => String(value || '').replace(/^@/, '').toLowerCase();
  const pathHandle = (href) => { try { const url = new URL(href, location.href); return url.origin === 'https://x.com' && /^\/[\w]{1,15}\/?$/.test(url.pathname) ? handle(url.pathname.split('/')[1]) : ''; } catch { return ''; } };
  async function message(type, extra = {}) {
    const result = await chrome.runtime.sendMessage({ type: `fm:${type}`, id: session.id, ...extra });
    if (!result?.ok) throw new Error(result?.error || 'The extension connection was lost. Stop and reopen the dashboard.');
    session = result.session;
    if (localControl && !terminal.has(session.status)) session = { ...session, status: localControl };
    render(); return session;
  }
  const el = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
  function mount() {
    if (host?.isConnected) return;
    host = document.createElement('div'); host.id = 'followers-manager-monitor';
    Object.assign(host.style, { position: 'fixed', inset: '16px 16px 16px auto', width: 'min(430px, calc(100vw - 32px))', zIndex: '2147483647', display: 'block' });
    shadow = host.attachShadow({ mode: 'open' });
    const style = el('style'); style.textContent = `
      :host{font-family:system-ui,sans-serif;color:#15324b;font-size:15px;line-height:1.5}*{box-sizing:border-box}.monitor{height:100%;overflow:auto;background:#fff;border:2px solid #006cba;border-radius:12px;box-shadow:0 12px 70px #0006;display:flex;flex-direction:column}header{padding:20px 22px;background:#153f60;color:#fff}header strong{display:block;font-size:22px}header span{font-size:13px}main{padding:20px 22px;flex:1}h2{font-size:25px;line-height:1.2;margin:8px 0}p{margin:10px 0}.badge{color:#006cba;font-weight:700;font-size:14px}.current{border:1px solid #b9d6eb;background:#edf6fd;padding:16px;margin:18px 0;border-radius:8px}.current strong{font-size:23px;display:block;overflow-wrap:anywhere}.reason{font-size:13px;display:block;color:#50667a}progress{width:100%;height:14px;accent-color:#006cba}.risk{background:#fff2dd;padding:12px;border-left:3px solid #ac5b00;font-size:13px}footer{position:sticky;bottom:0;background:#fff;border-top:1px solid #d9e3ec;padding:18px 22px;display:flex;gap:10px;flex-wrap:wrap}button{font:600 15px system-ui;cursor:pointer;padding:11px 16px;border:1px solid #006cba;border-radius:6px;background:#006cba;color:white}button.secondary{background:white;color:#15324b;border-color:#a8bacb}button.stop{background:#ad2941;border-color:#ad2941}button:disabled{opacity:.4;cursor:default}button:focus-visible{outline:3px solid #006cba;outline-offset:3px}.log{font-size:12px;border-top:1px solid #d9e3ec;margin-top:18px;padding-top:10px}.log p{margin:5px 0}.muted{color:#50667a;font-size:13px}.timer{font-size:17px;font-weight:650;color:#9a283d;min-height:27px}.close{font-size:12px;border:0;background:none;color:#50667a;padding:0}
    `;
    shadow.append(style);
    const panel = el('section', null, 'monitor'); panel.setAttribute('aria-label', 'Followers Manager live monitor');
    const header = el('header'); header.append(el('strong', 'Followers Manager'), el('span', session.mode === 'cleanup' ? 'Supervised unfollow session' : session.mode === 'scan' ? 'Follower / following scan' : 'Profile evidence inspection'));
    const main = el('main');
    main.append(el('div', '', 'badge'), el('h2', 'Stay here. Stay in control.'), el('p', 'Keep this tab visible and focused. Watch continuously; use Pause or Stop whenever needed.'));
    const current = el('div', null, 'current'); current.append(el('span', 'Current account', 'muted'), el('strong'), el('span', '', 'reason')); main.append(current);
    const progress = el('progress'); progress.max = Math.max(session.queue.length, 1); progress.value = 0; progress.setAttribute('aria-label', 'Session progress');
    main.append(progress, el('p', '', 'progress-text'), el('p', '', 'timer'));
    const status = el('p', '', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); main.append(status);
    main.append(el('p', session.mode === 'cleanup' ? 'You are responsible for these account actions. Monitoring and consent do not change X’s rules. X prohibits website scripting and automated unfollowing; restrictions or suspension remain possible.' : 'This session reads rendered pages. Lists can be partial; activity evidence can be unavailable. No unfollows occur in this mode.', 'risk'));
    main.append(el('p', 'Stop blocks further clicks. A request already submitted may still finish. Unfollows have no guaranteed undo.', 'muted'));
    main.append(el('div', '', 'log'));
    const footer = el('footer');
    const resume = el('button', 'Begin'); resume.id = 'fm-resume'; resume.addEventListener('click', async (event) => {
      if (!event.isTrusted || busy) return;
      try { assertLocal(); localControl = ''; await message('resume'); void run(); } catch (error) { await pause(error.message); }
    });
    const pauseButton = el('button', 'Pause', 'secondary'); pauseButton.id = 'fm-pause'; pauseButton.addEventListener('click', () => { void pause('Paused by you. Press Resume when ready.'); });
    const stop = el('button', 'Stop', 'stop'); stop.id = 'fm-stop'; stop.addEventListener('click', () => { void stopRun(); });
    const close = el('button', 'Close monitor', 'close'); close.addEventListener('click', async () => { await stopRun(); host.remove(); });
    footer.append(resume, pauseButton, stop, close); panel.append(header, main, footer); shadow.append(panel); document.documentElement.append(host); render();
  }
  function render() {
    if (!shadow || !session) return;
    shadow.querySelector('.badge').textContent = `${session.status} · @${session.account}`;
    const current = session.queue[session.index];
    shadow.querySelector('.current strong').textContent = current ? `@${current.username}` : session.mode === 'scan' ? `@${session.account}/${session.direction}` : 'Selection processed';
    shadow.querySelector('.reason').textContent = current?.reasons?.join(' · ') || (session.mode === 'scan' ? 'Collecting observed cards only; coverage needs your review.' : 'Your reviewed selection');
    shadow.querySelector('progress').value = session.mode === 'scan' ? 0 : session.index;
    shadow.querySelector('.progress-text').textContent = session.mode === 'scan' ? `${Math.max(seen.size, session.records.length)} accounts collected` : `${session.index} of ${session.queue.length} processed · ${session.results.filter((r) => r.outcome === 'confirmed').length} confirmed unfollows`;
    shadow.querySelector('.status').textContent = session.message;
    shadow.querySelector('.timer').textContent = countdown || (pending ? 'An action was submitted; awaiting confirmation.' : '');
    const resume = shadow.querySelector('#fm-resume'); resume.textContent = session.status === 'ready' ? (session.mode === 'cleanup' ? 'Begin supervised unfollow' : 'Begin reading') : 'Resume';
    resume.disabled = session.status === 'running' || terminal.has(session.status) || busy;
    shadow.querySelector('#fm-pause').disabled = session.status !== 'running'; shadow.querySelector('#fm-stop').disabled = terminal.has(session.status);
    const log = shadow.querySelector('.log'); log.replaceChildren(...session.results.slice(-8).reverse().map((r) => el('p', `@${r.username}: ${r.outcome}${r.detail ? ` — ${r.detail}` : ''}`)));
  }
  function signedInAccount() {
    const links = [...document.querySelectorAll('a[data-testid="AppTabBar_Profile_Link"]')];
    const accounts = new Set(links.map((a) => pathHandle(a.href)).filter(Boolean));
    return accounts.size === 1 ? [...accounts][0] : '';
  }
  function assertLocal() {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) throw new Error('Paused: keep the monitor tab visible and focused.');
    if (!host?.isConnected || !host.getClientRects().length) throw new Error('Monitor is no longer visible.');
    const bounds = host.getBoundingClientRect(), style = getComputedStyle(host);
    if (style.visibility !== 'visible' || Number(style.opacity) === 0 || bounds.width < 200 || bounds.height < 200 || bounds.top < 0 || bounds.bottom > innerHeight + 1) throw new Error('The monitor is obscured or outside the visible page.');
    if (signedInAccount() !== session.account) throw new Error('The signed-in account could not be verified or has changed. Stop and check the account shown in X.');
    const expected = session.mode === 'inspect' ? `/${session.queue[session.index]?.username}` : `/${session.account}/${session.mode === 'scan' ? session.direction : 'following'}`;
    if (location.origin !== 'https://x.com' || location.pathname.replace(/\/$/, '').toLowerCase() !== expected.toLowerCase()) throw new Error('The session page changed. Stop and start again from the dashboard.');
    if (document.querySelector('[data-testid="toast"]')?.textContent?.match(/limit|locked|suspend|try again|error/i) || document.querySelector('iframe[src*="captcha"], [data-testid="ocfEnterTextTextInput"]')) throw new Error('X displayed a restriction or verification request. Session paused.');
  }
  async function guard() {
    if (session.status !== 'running') throw new Error('Session is paused.');
    assertLocal(); await message('guard');
    if (session.status !== 'running') throw new Error('Session is paused.');
    assertLocal();
  }
  async function pause(reason) {
    version++; countdown = '';
    if (!session || terminal.has(session.status)) return;
    localControl = 'paused';
    session.status = 'paused'; session.message = reason; render();
    // Cancel only a confirmation opened by this runner, before any request was sent.
    if (!pending && ownedDialog()) ownedDialog().querySelector('[data-testid="confirmationSheetCancel"]')?.click();
    try { await message('pause', { message: reason }); } catch { /* Local pause still prevents clicks. */ }
  }
  async function stopRun() {
    version++; countdown = ''; if (!session) return; localControl = 'stopped';
    session.status = 'stopped'; session.message = pending ? 'Stopped. An already submitted action may still complete.' : 'Stopped. No further actions will start.'; render();
    if (!pending && ownedDialog()) ownedDialog().querySelector('[data-testid="confirmationSheetCancel"]')?.click();
    try { await message('stop', { message: session.message }); } catch { /* Remain stopped locally. */ }
  }
  function cells() { return [...document.querySelectorAll('[data-testid="UserCell"]')].filter((c) => !host.contains(c)); }
  function usernameOf(cell) {
    const reserved = new Set(['home', 'explore', 'notifications', 'messages', 'settings', 'search', 'compose', 'i']);
    const names = new Set([...cell.querySelectorAll('a[href]')].map((a) => pathHandle(a.href)).filter((s) => s && !reserved.has(s)));
    return names.size === 1 ? [...names][0] : '';
  }
  function recordOf(cell) {
    const username = usernameOf(cell); if (!username) return null;
    const button = cell.querySelector('[data-testid$="-unfollow"], [data-testid$="-follow"]');
    const id = button?.getAttribute('data-testid')?.match(/^(\d+)-(?:un)?follow$/)?.[1] || null;
    const link = [...cell.querySelectorAll('a[href]')].find((a) => pathHandle(a.href) === username && a.textContent.trim() && !a.textContent.trim().startsWith('@'));
    return { id, username, name: (link?.textContent.trim() || username).slice(0, 100), bio: (cell.querySelector('[data-testid="UserDescription"]')?.textContent || '').slice(0, 1000), observedAt: new Date().toISOString(), lastPostAt: null, protected: !!cell.querySelector('[data-testid="icon-lock"], [aria-label="Protected account"]') };
  }
  let confirmationFor = null;
  function ownedDialog() {
    if (!confirmationFor) return null;
    const dialogs = [...document.querySelectorAll('[data-testid="confirmationSheetDialog"], [role="alertdialog"], [role="dialog"]')];
    const expected = new RegExp(`@${confirmationFor}(?![a-z0-9_])`, 'i');
    return dialogs.find((d) => expected.test(d.textContent) && d.querySelector('[data-testid="confirmationSheetConfirm"]')) || null;
  }
  async function countdownBeforeAction() {
    const token = version;
    for (let left = session.delayMs / 1000; left > 0; left--) {
      await guard(); if (token !== version) throw new Error('Paused.');
      countdown = `Unfollowing @${session.queue[session.index].username} in ${left}s`; render(); await wait(1000);
    }
    countdown = ''; await guard(); if (token !== version) throw new Error('Paused.');
  }
  async function findTarget(target) {
    scrollTo(0, 0); let idle = 0, last = -1;
    const discovered = new Set();
    for (let pass = 0; pass < 180 && idle < 6; pass++) {
      await guard();
      for (const cell of cells()) {
        const name = usernameOf(cell); if (name) discovered.add(name);
        if (name === target.username) return cell;
      }
      idle = discovered.size === last ? idle + 1 : 0; last = discovered.size;
      countdown = `Finding @${target.username} in your following list…`; render(); scrollBy(0, 640); await wait(800);
    }
    throw new Error(`@${target.username} could not be located reliably. No action was taken; check the list and start a new selection.`);
  }
  async function cleanup() {
    while (session.status === 'running' && session.index < session.queue.length) {
      const target = session.queue[session.index]; await message('update', { current: target });
      const cell = await findTarget(target); cell.scrollIntoView({ block: 'center' });
      await countdownBeforeAction();
      if (!cell.isConnected || usernameOf(cell) !== target.username) throw new Error('The target row changed during the countdown. No action taken.');
      const record = recordOf(cell);
      if (target.id && record.id !== target.id) throw new Error('The stable account ID could not be verified. No action taken.');
      if (record.protected) throw new Error('The account is now protected. No action taken.');
      const reciprocalReason = target.reasons.some((r) => /No longer observed|Does not appear among/i.test(r));
      if (reciprocalReason && cell.querySelector('[data-testid="userFollowIndicator"]')) {
        await message('update', { index: session.index, result: { outcome: 'skipped', detail: 'X now shows this account follows you. No unfollow submitted.' } });
        continue;
      }
      const button = cell.querySelector('[data-testid$="-unfollow"]');
      if (!button || button.disabled) throw new Error('A unique Following button could not be verified. No action taken.');
      if (document.querySelector('[data-testid="confirmationSheetConfirm"]')) throw new Error('Another confirmation is open. Close it and resume.');
      await guard();
      if (!cell.isConnected || usernameOf(cell) !== target.username || !cell.contains(button)) throw new Error('Target changed before opening confirmation.');
      confirmationFor = target.username; button.click();
      let dialog;
      for (let n = 0; n < 25; n++) { await wait(100); if (session.status !== 'running') throw new Error('Paused before confirmation.'); dialog = ownedDialog(); if (dialog) break; }
      if (!dialog) throw new Error('The expected confirmation did not appear. No confirmation was clicked.');
      await guard();
      const confirm = dialog.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (!ownedDialog() || confirm.disabled || !confirm.isConnected) throw new Error('The confirmation changed. No action taken.');
      const index = session.index; pending = true; render(); confirm.click();
      // No more destructive clicks until a rendered result is positively observed.
      let confirmed = false;
      for (let n = 0; n < 60; n++) {
        await wait(150);
        const current = cells().find((c) => usernameOf(c) === target.username);
        const follow = current?.querySelector('[data-testid$="-follow"]');
        if (follow && (!target.id || follow.getAttribute('data-testid') === `${target.id}-follow`) && !ownedDialog()) { confirmed = true; break; }
      }
      pending = false; confirmationFor = null;
      await message('update', { index, result: { outcome: confirmed ? 'confirmed' : 'uncertain', detail: confirmed ? 'X now displays a Follow button.' : 'No definitive rendered result. Do not retry blindly.' } });
      if (!confirmed) { await pause('Outcome uncertain. Check this account in X before starting another session.'); return; }
    }
    if (session.status === 'running') await message('update', { status: 'complete', message: 'Selection processed. Review the confirmed results below.' });
  }
  async function scan() {
    session.records.forEach((r) => seen.set(r.username, r));
    let idle = 0, last = -1;
    for (let pass = 0; pass < 500; pass++) {
      await guard();
      for (const cell of cells()) { const row = recordOf(cell); if (row && seen.size < 10000) seen.set(row.username, row); }
      idle = seen.size === last ? idle + 1 : 0; last = seen.size;
      await message('update', { records: [...seen.values()], message: `${seen.size} observed accounts. Save as partial unless you independently verify full coverage.` });
      if (idle >= 8 || seen.size >= 10000) { await message('update', { status: 'complete', message: seen.size >= 10000 ? 'Collection cap reached. This list is partial.' : 'No more cards observed. This does not prove full-list coverage. Return to the dashboard to save.' }); return; }
      scrollBy(0, 640); await wait(1000);
    }
    await pause('Scan time bound reached. Save the partial observation or resume.');
  }
  async function inspect() {
    await guard(); const target = session.queue[session.index];
    await message('update', { current: target, message: `Reading public evidence for @${target.username}.` });
    // Let the rendered timeline settle, without probing private data or hidden endpoints.
    for (let n = 0; n < 5; n++) { await wait(1000); await guard(); }
    const dates = [...document.querySelectorAll('article[data-testid="tweet"]')].filter((article) =>
      !article.querySelector('[data-testid="socialContext"]') && [...article.querySelectorAll('a[href]')].some((a) => new RegExp(`^/${target.username}/status/`, 'i').test(new URL(a.href, location.href).pathname))
    ).map((a) => a.querySelector('time')?.dateTime).filter((d) => d && Number.isFinite(Date.parse(d))).sort((a, b) => Date.parse(b) - Date.parse(a));
    const profile = { username: target.username, id: target.id, bio: (document.querySelector('[data-testid="UserDescription"]')?.textContent || '').slice(0, 1000), lastPostAt: dates[0] || null, observedAt: new Date().toISOString() };
    await guard();
    await message('update', { index: session.index, result: { outcome: 'observed', detail: dates.length ? 'Latest public post in the rendered timeline sample; review before acting.' : 'No public post evidence available; inactivity is unknown.', profile } });
    await message('next-profile');
  }
  async function run() {
    if (busy || session.status !== 'running') return;
    busy = true; render();
    try { if (session.mode === 'cleanup') await cleanup(); else if (session.mode === 'scan') await scan(); else await inspect(); }
    catch (error) { await pause(error.message); }
    finally { busy = false; countdown = ''; render(); }
  }
  chrome.runtime.onMessage.addListener((request, _sender, respond) => {
    if (request.type !== 'fm:boot') return;
    chrome.storage.local.get('fmSession').then(({ fmSession }) => {
      if (fmSession?.id !== request.id) return;
      if (session && session.id !== fmSession.id) return;
      if (session) { render(); return; }
      session = fmSession; mount(); render();
      if (session.status === 'running') void pause('Page reloaded. Check the monitor and press Resume; no automatic restart.');
    }); respond({ ok: true });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !session || changes.fmSession?.newValue?.id !== session.id) return;
    const next = changes.fmSession.newValue;
    if (next.status !== 'running' && session.status === 'running') version++;
    session = localControl && !terminal.has(next.status) ? { ...next, status: localControl } : next; render();
  });
  document.addEventListener('visibilitychange', () => { if (session?.status === 'running' && document.visibilityState !== 'visible') void pause('Monitor hidden. Return to this tab and press Resume.'); });
  window.addEventListener('blur', () => { if (session?.status === 'running') void pause('Monitor lost focus. Return and press Resume.'); });
  // A removed monitor or changed account must stop progress even during a countdown.
  setInterval(() => { if (session?.status === 'running') { try { assertLocal(); } catch (error) { void pause(error.message); } } }, 500);
})();
