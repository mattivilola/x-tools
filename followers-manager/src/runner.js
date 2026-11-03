/* Runs only in a dedicated, extension-owned X tab. No cookies, private API, or request interception. */
(() => {
  if (globalThis.__followersManager) return;
  const readers = globalThis.FollowersManagerDOM;
  if (!readers) throw new Error('Followers Manager page readers were not loaded. Reload the extension.');
  globalThis.__followersManager = true;
  let session, host, shadow, busy = false, version = 0, countdown = '', pending = false, localControl = '';
  const seen = new Map();
  const terminal = new Set(['complete', 'stopped', 'error']);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const handle = (value) => String(value || '').replace(/^@/, '').toLowerCase();
  function durationLabel(seconds) {
    const rounded = Math.ceil(Math.max(0, seconds));
    const minutes = Math.floor(rounded / 60), rest = rounded % 60;
    return minutes ? `${minutes}m${rest ? ` ${rest}s` : ''}` : `${rest}s`;
  }
  function countdownEstimate(count) {
    const hasRange = Number.isFinite(session.delayMinMs) && Number.isFinite(session.delayMaxMs);
    const minMs = hasRange ? session.delayMinMs : (Number(session.delayMs) || 6000);
    const maxMs = hasRange ? session.delayMaxMs : minMs;
    const minSeconds = Math.ceil(count * minMs / 1000), maxSeconds = Math.ceil(count * maxMs / 1000);
    if (minMs === maxMs) return durationLabel(minSeconds);
    const expectedSeconds = Math.ceil(count * (minMs + maxMs) / 2000);
    return `${durationLabel(minSeconds)}–${durationLabel(maxSeconds)} (expected ${durationLabel(expectedSeconds)})`;
  }
  const pathHandle = (href) => { try { const url = new URL(href, location.href); return url.origin === 'https://x.com' && /^\/[\w]{1,15}\/?$/.test(url.pathname) ? handle(url.pathname.split('/')[1]) : ''; } catch { return ''; } };
  async function message(type, extra = {}) {
    const result = await chrome.runtime.sendMessage({ type: `fm:${type}`, id: session.id, ...extra });
    if (!result?.ok) throw new Error(result?.error || 'The extension connection was lost. Stop and reopen the dashboard.');
    session = { ...session, ...result.session };
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
    const header = el('header'); header.append(el('strong', 'Followers Manager'), el('span', session.mode === 'follow' ? 'Supervised follow-back session' : session.mode === 'cleanup' ? 'Supervised unfollow session' : session.mode === 'scan' ? 'Follower / following scan' : 'Profile evidence inspection'));
    const main = el('main');
    main.append(el('div', '', 'badge'), el('h2', 'Stay in control.'), el('p', session.pauseOnFocusLoss === false ? 'Focus pausing is OFF. This session may continue when hidden. Monitor progress and return to use Pause or Stop.' : 'Focus pausing is ON. Keep this tab visible and focused. Use Pause or Stop whenever needed.'));
    const current = el('div', null, 'current'); current.append(el('span', 'Current account', 'muted'), el('strong'), el('span', '', 'reason')); main.append(current);
    const progress = el('progress'); progress.max = Math.max(session.queue.length, 1); progress.value = 0; progress.setAttribute('aria-label', 'Session progress');
    main.append(progress, el('p', '', 'progress-text'), el('p', '', 'estimate muted'), el('p', '', 'timer'));
    const status = el('p', '', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); main.append(status);
    const scanReview = el('div', '', 'risk'); scanReview.id = 'fm-scan-review';
    scanReview.append(el('strong', 'Check whether the list has finished loading'), el('p', 'No new cards does not prove the end. Scroll the list yourself if needed, then Resume, or use Auto Retry for up to three loading attempts. Finish only when you want to review and save this observation.'));
    main.append(scanReview, el('p', '', 'scan-progress muted'));
    main.append(el('p', ['cleanup','follow'].includes(session.mode) ? 'You are responsible for these account actions. Monitoring and consent do not change X’s rules. X restricts website scripting and automated following/unfollowing; restrictions or suspension remain possible.' : 'This session reads rendered pages. Lists can be partial; activity evidence can be unavailable. No follow/unfollow actions occur in this mode.', 'risk'));
    main.append(el('p', 'Stop blocks further clicks. A request already submitted may still finish. Unfollows have no guaranteed undo.', 'muted'));
    main.append(el('div', '', 'log'));
    const footer = el('footer');
    async function begin(event, autoRetry = false) {
      if (!event.isTrusted || busy) return;
      try { if (document.visibilityState !== 'visible' || !document.hasFocus()) throw new Error('Return to the focused monitor to begin or resume.'); assertLocal(); localControl = ''; await message('resume', { autoRetry }); void run(); } catch (error) { await pause(error.message); }
    }
    const resume = el('button', 'Begin'); resume.id = 'fm-resume'; resume.addEventListener('click', (event) => { void begin(event); });
    const retry = el('button', 'Auto Retry (3 attempts)', 'secondary'); retry.id = 'fm-scan-retry'; retry.addEventListener('click', (event) => { void begin(event, true); });
    const finishScan = el('button', 'Finish scan and review results'); finishScan.id = 'fm-finish-scan'; finishScan.addEventListener('click', async (event) => {
      if (!event.isTrusted || busy) return;
      try { await message('finish-scan'); } catch (error) { session.message = error.message; render(); }
    });
    const pauseButton = el('button', 'Pause', 'secondary'); pauseButton.id = 'fm-pause'; pauseButton.addEventListener('click', () => { void pause('Paused by you. Press Resume when ready.'); });
    const stop = el('button', 'Stop', 'stop'); stop.id = 'fm-stop'; stop.addEventListener('click', () => { void stopRun(); });
    const close = el('button', 'Close monitor', 'close'); close.addEventListener('click', async () => { await stopRun(); host.remove(); });
    const back = el('button', 'Return to dashboard', 'secondary'); back.id = 'fm-return'; back.addEventListener('click', () => { void message('return').catch((error) => { session.message = error.message; render(); }); });
    footer.append(resume, retry, finishScan, pauseButton, stop, back, close); panel.append(header, main, footer); shadow.append(panel); document.documentElement.append(host); render();
  }
  function render() {
    if (!shadow || !session) return;
    shadow.querySelector('.badge').textContent = `${session.status} · @${session.account}`;
    const current = session.queue[session.index];
    shadow.querySelector('.current strong').textContent = current ? `@${current.username}` : session.mode === 'scan' ? `@${session.account}/${session.direction}` : 'Selection processed';
    shadow.querySelector('.reason').textContent = current?.reasons?.join(' · ') || (session.mode === 'scan' ? 'Collecting observed cards only; coverage needs your review.' : 'Your reviewed selection');
    shadow.querySelector('progress').value = session.mode === 'scan' ? 0 : session.index;
    shadow.querySelector('.progress-text').textContent = session.mode === 'scan' ? `${Math.max(seen.size, session.records.length)} accounts collected` : `${session.index} of ${session.queue.length} processed · ${session.results.filter((r) => r.outcome === 'confirmed').length} confirmed ${session.mode === 'follow' ? 'follows' : 'unfollows'}`;
    const remaining = Math.max(0, session.queue.length - session.index);
    shadow.querySelector('.estimate').textContent = ['follow', 'cleanup'].includes(session.mode) ? `${session.batchSize === '5' ? 'First 5 test batch · ' : ''}Remaining countdown estimate: ${countdownEstimate(remaining)}, plus lookup and confirmation. Pauses and browser throttling add time.` : '';
    shadow.querySelector('.status').textContent = session.message;
    shadow.querySelector('.timer').textContent = countdown || (pending ? 'An action was submitted; awaiting confirmation.' : '');
    const resume = shadow.querySelector('#fm-resume'); resume.textContent = session.status === 'ready' ? (session.mode === 'follow' ? 'Begin supervised follow back' : session.mode === 'cleanup' ? 'Begin supervised unfollow' : 'Begin reading') : 'Resume';
    resume.disabled = session.status === 'running' || terminal.has(session.status) || busy;
    shadow.querySelector('#fm-pause').disabled = session.status !== 'running'; shadow.querySelector('#fm-stop').disabled = terminal.has(session.status);
    shadow.querySelector('#fm-return').hidden = session.status !== 'complete';
    const review = session.mode === 'scan' && session.status === 'paused' && !!session.scanReview;
    shadow.querySelector('#fm-scan-review').hidden = !review;
    shadow.querySelector('#fm-scan-retry').hidden = !review || session.scanReview !== 'stalled';
    shadow.querySelector('#fm-scan-retry').disabled = busy;
    shadow.querySelector('#fm-finish-scan').hidden = !review;
    shadow.querySelector('#fm-finish-scan').disabled = busy;
    if (session.mode === 'scan' && session.scanReview === 'capacity') resume.disabled = true;
    const p = session.scanProgress;
    shadow.querySelector('.scan-progress').textContent = session.mode === 'scan' && p ? `List scroll: ${Math.round(p.scrollTop)} / ${Math.max(0, Math.round(p.scrollHeight - p.viewportHeight))}px · ${p.atBottom ? 'at the currently loaded bottom' : 'more scroll space remains'}${p.loading ? ' · loading indicator visible' : ''}. ${session.scanRetriesRemaining || 0} auto retries remaining.` : '';
    const log = shadow.querySelector('.log'); log.replaceChildren(...session.results.slice(-8).reverse().map((r) => el('p', `@${r.username}: ${r.outcome}${r.detail ? ` — ${r.detail}` : ''}`)));
  }
  function signedInAccount() {
    const links = [...document.querySelectorAll('a[data-testid="AppTabBar_Profile_Link"]')];
    const accounts = new Set(links.map((a) => pathHandle(a.href)).filter(Boolean));
    return accounts.size === 1 ? [...accounts][0] : '';
  }
  const restrictionNoticePattern = /\b(?:rate[ -]?limit(?:ed|ation|s)?|limit(?:ed|ation|s)?|locked|suspended?|suspension|blocked|restrict(?:ed|ion)?|challenge|verification|verify|unusual activity|automated activity|try again later|unable to (?:follow|unfollow)|cannot (?:follow|unfollow))\b/i;
  const noticeSelectors = '[role="alert"], [role="status"], [role="alertdialog"], [role="dialog"], [data-testid="toast"], [data-testid*="toast" i], [data-testid*="alert" i]';
  const challengeSelectors = 'iframe[src*="captcha" i], iframe[src*="challenge" i], [data-testid="ocfEnterTextTextInput"], [data-testid*="challenge" i], [data-testid*="captcha" i], [data-testid="rateLimitExceeded"], [data-testid="suspensionNotice"]';
  function visible(element) {
    if (!element?.getClientRects().length) return false;
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  }
  function restrictionDetected() {
    if (document.querySelector(challengeSelectors)) return true;
    return [...document.querySelectorAll(noticeSelectors)].some((notice) => visible(notice) && restrictionNoticePattern.test(notice.textContent || ''));
  }
  function assertLocal() {
    if (session.pauseOnFocusLoss !== false && (document.visibilityState !== 'visible' || !document.hasFocus())) throw new Error('Paused: keep the monitor tab visible and focused.');
    if (!host?.isConnected || !host.getClientRects().length) throw new Error('Monitor is no longer visible.');
    const bounds = host.getBoundingClientRect(), style = getComputedStyle(host);
    if (style.visibility !== 'visible' || Number(style.opacity) === 0 || bounds.width < 200 || bounds.height < 200 || bounds.top < 0 || bounds.bottom > innerHeight + 1) throw new Error('The monitor is obscured or outside the visible page.');
    if (signedInAccount() !== session.account) throw new Error('The signed-in account could not be verified or has changed. Stop and check the account shown in X.');
    const expected = session.mode === 'inspect' ? `/${session.queue[session.index]?.username}` : `/${session.account}/${session.mode === 'scan' ? session.direction : session.mode === 'follow' ? 'followers' : 'following'}`;
    if (location.origin !== 'https://x.com' || location.pathname.replace(/\/$/, '').toLowerCase() !== expected.toLowerCase()) throw new Error('The session page changed. Stop and start again from the dashboard.');
    if (restrictionDetected()) throw new Error('X displayed a limitation, restriction, block, or verification challenge. Session paused.');
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
  let cardsDirty = true, cardList = [], cardIndex = new Map();
  // The overlay's shadow tree is outside this observer, so timer renders do not
  // invalidate the rendered-page index. Never retain a disconnected target.
  new MutationObserver(() => { cardsDirty = true; }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  function cells() {
    if (cardsDirty) {
      cardList = readers.listCells().filter((c) => !host?.contains(c));
      cardIndex = new Map(cardList.map((c) => [usernameOf(c), c])); cardsDirty = false;
    }
    return cardList;
  }
  function usernameOf(cell) {
    return readers.usernameOf(cell);
  }
  function recordOf(cell) {
    return readers.recordOf(cell, session.mode === 'scan' ? session.direction : session.mode === 'follow' ? 'followers' : 'following');
  }
  function assertTargetIdentity(cell, target) {
    if (!cell?.isConnected || usernameOf(cell) !== target.username) throw new Error('The target row changed. No action taken.');
    const record = recordOf(cell);
    if (!record) throw new Error('The target identity could not be verified. No action taken.');
    if (target.id && record.id !== target.id) throw new Error('The stable account ID could not be verified. No action taken.');
    return record;
  }
  function relationshipButtons(cell) {
    return { following: cell.querySelector('[data-testid$="-unfollow"]'), follow: cell.querySelector('[data-testid$="-follow"]') };
  }
  async function skipCurrent(detail, isFollowing) {
    const result = { outcome: 'skipped', detail };
    if (isFollowing === true || isFollowing === false) result.isFollowing = isFollowing;
    await message('update', { index: session.index, result });
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
    const hasRange = Number.isFinite(session.delayMinMs) && Number.isFinite(session.delayMaxMs);
    const minSeconds = hasRange ? Math.ceil(session.delayMinMs / 1000) : Math.ceil((Number(session.delayMs) || 6000) / 1000);
    const maxSeconds = hasRange ? Math.floor(session.delayMaxMs / 1000) : minSeconds;
    if (maxSeconds < minSeconds) throw new Error('The action countdown range is invalid.');
    const leftStart = hasRange ? minSeconds + Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) : minSeconds;
    for (let left = leftStart; left > 0; left--) {
      await guard(); if (token !== version) throw new Error('Paused.');
      countdown = `${session.mode === 'follow' ? 'Following' : 'Unfollowing'} @${session.queue[session.index].username} in ${left}s`; render(); await wait(1000);
    }
    countdown = ''; await guard(); if (token !== version) throw new Error('Paused.');
  }
  async function findTarget(target) {
    await guard(); cells();
    const current = cardIndex.get(target.username);
    if (current?.isConnected) return current;
    countdown = `Checking the next list window for @${target.username}…`; render(); readers.scrollList(640); await wait(800);
    await guard(); countdown = ''; cells();
    const next = cardIndex.get(target.username);
    return next?.isConnected ? next : null;
  }
  async function cleanup() {
    while (session.status === 'running' && session.index < session.queue.length) {
      const target = session.queue[session.index]; await message('update', { current: target });
      const cell = await findTarget(target);
      if (!cell) { await skipCurrent('Not found in this list window; relationship unknown.'); continue; }
      cell.scrollIntoView({ block: 'center' });
      let record = assertTargetIdentity(cell, target);
      if (record.protected) throw new Error('The account is now protected. No action taken.');
      let buttons = relationshipButtons(cell);
      if (record.isFollowing === false && buttons.follow && !buttons.following) {
        await skipCurrent('Already not following.', false); continue;
      }
      if (record.isFollowing !== true || !buttons.following || buttons.follow) throw new Error('The current following state could not be verified. No action taken.');
      const preserveVerified = session.action === 'unfollow-unverified-nonfollowers';
      if (preserveVerified && (record.verified !== false || record.followsYou !== false)) {
        await skipCurrent('Verified, follows you, or relationship evidence unavailable. No unfollow submitted.');
        continue;
      }
      const reciprocalReason = session.action === 'unfollow-nonfollowers' || preserveVerified || target.reasons.some((r) => /No longer observed|Does not appear among/i.test(r));
      if (reciprocalReason && readers.followsYou(cell)) {
        await skipCurrent('X now shows this account follows you. No unfollow submitted.');
        continue;
      }
      await countdownBeforeAction();
      record = assertTargetIdentity(cell, target);
      if (record.protected) throw new Error('The account is now protected. No action taken.');
      buttons = relationshipButtons(cell);
      if (record.isFollowing === false && buttons.follow && !buttons.following) {
        await skipCurrent('Already not following.', false); continue;
      }
      if (record.isFollowing !== true || !buttons.following || buttons.follow) throw new Error('The current following state could not be verified. No action taken.');
      if (preserveVerified && (record.verified !== false || record.followsYou !== false)) {
        await skipCurrent('Verified, follows you, or relationship evidence unavailable. No unfollow submitted.');
        continue;
      }
      if (reciprocalReason && readers.followsYou(cell)) {
        await skipCurrent('X now shows this account follows you. No unfollow submitted.');
        continue;
      }
      const button = buttons.following;
      if (!button || button.disabled) throw new Error('A unique Following button could not be verified. No action taken.');
      if (document.querySelector('[data-testid="confirmationSheetConfirm"]')) throw new Error('Another confirmation is open. Close it and resume.');
      await guard();
      record = assertTargetIdentity(cell, target);
      if (record.protected) throw new Error('The account is now protected. No action taken.');
      buttons = relationshipButtons(cell);
      if (record.isFollowing === false && buttons.follow && !buttons.following) {
        await skipCurrent('Already not following.', false); continue;
      }
      if (record.isFollowing !== true || !buttons.following || buttons.follow || !cell.contains(button)) throw new Error('Target changed before opening confirmation.');
      if (preserveVerified && (record.verified !== false || record.followsYou !== false)) {
        await skipCurrent('Verified, follows you, or relationship evidence unavailable. No unfollow submitted.'); continue;
      }
      if (reciprocalReason && readers.followsYou(cell)) {
        await skipCurrent('X now shows this account follows you. No unfollow submitted.'); continue;
      }
      confirmationFor = target.username; button.click();
      let dialog;
      for (let n = 0; n < 25; n++) { await wait(100); if (session.status !== 'running') throw new Error('Paused before confirmation.'); dialog = ownedDialog(); if (dialog) break; }
      if (!dialog) throw new Error('The expected confirmation did not appear. No confirmation was clicked.');
      await guard();
      const confirm = dialog.querySelector('[data-testid="confirmationSheetConfirm"]');
      if (!ownedDialog() || confirm.disabled || !confirm.isConnected) throw new Error('The confirmation changed. No action taken.');
      record = assertTargetIdentity(cell, target);
      if (record.protected) throw new Error('The account is now protected. No unfollow submitted.');
      buttons = relationshipButtons(cell);
      if (record.isFollowing === false && buttons.follow && !buttons.following) {
        ownedDialog().querySelector('[data-testid="confirmationSheetCancel"]')?.click(); confirmationFor = null;
        await skipCurrent('Already not following.', false); continue;
      }
      if (record.isFollowing !== true || !buttons.following || buttons.follow) throw new Error('The following state changed before confirmation. No unfollow submitted.');
      if ((preserveVerified && (record.verified !== false || record.followsYou !== false)) || (reciprocalReason && readers.followsYou(cell))) {
        ownedDialog().querySelector('[data-testid="confirmationSheetCancel"]')?.click(); confirmationFor = null;
        await skipCurrent(preserveVerified ? 'Verified, follows you, or relationship evidence unavailable. No unfollow submitted.' : 'X now shows this account follows you. No unfollow submitted.');
        continue;
      }
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
  async function followBack() {
    while (session.status === 'running' && session.index < session.queue.length) {
      const target = session.queue[session.index]; await message('update', { current: target });
      const cell = await findTarget(target);
      if (!cell) { await skipCurrent('Not found in this list window; relationship unknown.'); continue; }
      cell.scrollIntoView({ block: 'center' });
      let record = assertTargetIdentity(cell, target);
      if (record.protected) { await skipCurrent('Private account excluded.'); continue; }
      if (record.isFollowing === true) { await skipCurrent('Already following.', true); continue; }
      if (target.requireVerified && !record.verified) { await skipCurrent('No verified badge currently observed.'); continue; }
      let buttons = relationshipButtons(cell);
      if (record.isFollowing !== false || !buttons.follow || buttons.following) throw new Error('The current following state could not be verified. No follow submitted.');
      await countdownBeforeAction();
      record = assertTargetIdentity(cell, target);
      if (record.protected) { await skipCurrent('Private account excluded.'); continue; }
      if (record.isFollowing === true) { await skipCurrent('Already following.', true); continue; }
      if (target.requireVerified && !record.verified) { await skipCurrent('No verified badge currently observed.'); continue; }
      buttons = relationshipButtons(cell);
      if (record.isFollowing !== false || !buttons.follow || buttons.following) throw new Error('The current following state could not be verified. No follow submitted.');
      if (buttons.follow.disabled) throw new Error('A unique Follow button could not be verified.');
      if (document.querySelector('[data-testid="confirmationSheetConfirm"]')) throw new Error('Another confirmation is open. No follow submitted.');
      await guard();
      record = assertTargetIdentity(cell, target);
      if (record.protected) { await skipCurrent('Private account excluded.'); continue; }
      if (record.isFollowing === true) { await skipCurrent('Already following.', true); continue; }
      if (target.requireVerified && !record.verified) { await skipCurrent('No verified badge currently observed.'); continue; }
      buttons = relationshipButtons(cell);
      if (record.isFollowing !== false || !buttons.follow || buttons.following || buttons.follow.disabled || !cell.contains(buttons.follow)) throw new Error('The target changed before the follow.');
      const button = buttons.follow;
      if (document.querySelector('[data-testid="confirmationSheetConfirm"]')) throw new Error('Another confirmation is open. No follow submitted.');
      const index = session.index; pending = true; render(); button.click();
      let confirmed = false;
      for (let n = 0; n < 60; n++) {
        await wait(150);
        const current = cells().find((c) => usernameOf(c) === target.username), following = current?.querySelector('[data-testid$="-unfollow"]');
        if (following && (!target.id || following.getAttribute('data-testid') === `${target.id}-unfollow`)) { confirmed = true; break; }
      }
      pending = false;
      await message('update', { index, result: { outcome: confirmed ? 'confirmed' : 'uncertain', detail: confirmed ? 'X now displays a Following button.' : 'No definitive follow result. Do not retry blindly.' } });
      if (!confirmed) { await pause('Follow outcome uncertain. Check this account in X before another session.'); return; }
    }
    if (session.status === 'running') await message('update', { status: 'complete', message: 'Follow-back selection processed. Review the results below.' });
  }
  async function scan() {
    session.records.forEach((r) => seen.set(r.username, r));
    let idle = 0, last = -1, lastScrollTop = -1;
    for (let pass = 0; pass < 500; pass++) {
      await guard();
      const changes = [];
      for (const cell of cells()) {
        const row = recordOf(cell); if (!row || (!seen.has(row.username) && seen.size >= 10000)) continue;
        const { observedAt, ...fields } = row, previous = seen.get(row.username);
        const { observedAt: previousTime, ...oldFields } = previous || {};
        if (JSON.stringify(fields) !== JSON.stringify(oldFields)) { seen.set(row.username, row); changes.push(row); }
      }
      const state = readers.listState();
      // Reading all currently mounted cards can discover a whole page at once.
      // Moving toward its bottom is progress even before the next page arrives.
      idle = seen.size !== last || state.scrollTop > lastScrollTop + 1 ? 0 : idle + 1;
      last = seen.size; lastScrollTop = state.scrollTop;
      await message('update', { recordChanges: changes, scanProgress: state, message: `${seen.size} observed accounts. Reading rendered list cards; coverage is not yet verified.` });
      if (seen.size >= 10000) {
        await message('update', { status: 'paused', scanReview: 'capacity', message: 'Collection capacity reached. Review and finish this partial observation; full coverage is not established.' }); return;
      }
      if (idle >= 8) {
        if (session.scanRetriesRemaining > 0) {
          const attempt = 4 - session.scanRetriesRemaining, delay = 1000 * 2 ** attempt;
          await message('update', { retryUsed: true, message: `Loading retry ${attempt}/3: waiting ${delay / 1000}s before another list scroll. Restrictions still pause immediately.` });
          for (let elapsed = 0; elapsed < delay; elapsed += 500) { await wait(500); await guard(); }
          readers.scrollList(640); idle = 0; continue;
        }
        await message('update', { status: 'paused', scanReview: 'stalled', message: 'No new accounts arrived after repeated checks. This may be a loading stall, not the end. Inspect the list, Resume, Auto Retry, or finish after review.' }); return;
      }
      readers.scrollList(640); await wait(state.loading ? 1500 : 1000);
    }
    await message('update', { status: 'paused', scanReview: 'time-bound', message: 'Scan time bound reached. Review progress, then Resume or finish this partial observation.' });
  }
  async function inspect() {
    await guard(); const target = session.queue[session.index];
    await message('update', { current: target, message: `Reading public evidence for @${target.username}.` });
    // Let the rendered timeline settle, without probing private data or hidden endpoints.
    for (let n = 0; n < 5; n++) { await wait(1000); await guard(); }
    const dates = [...document.querySelectorAll('article[data-testid="tweet"]')].filter((article) =>
      !article.querySelector('[data-testid="socialContext"]') && [...article.querySelectorAll('a[href]')].some((a) => new RegExp(`^/${target.username}/status/`, 'i').test(new URL(a.href, location.href).pathname))
    ).map((a) => a.querySelector('time')?.dateTime).filter((d) => d && Number.isFinite(Date.parse(d))).sort((a, b) => Date.parse(b) - Date.parse(a));
    const bioNode = document.querySelector('[data-testid="UserDescription"]');
    const profile = { username: target.username, id: target.id, bio: (bioNode?.textContent || '').slice(0, 1000), bioObserved: !!bioNode, lastPostAt: dates[0] || null, observedAt: new Date().toISOString() };
    await guard();
    await message('update', { index: session.index, result: { outcome: 'observed', detail: dates.length ? 'Latest public post in the rendered timeline sample; review before acting.' : 'No public post evidence available; inactivity is unknown.', profile } });
    await message('next-profile');
  }
  async function run() {
    if (busy || session.status !== 'running') return;
    busy = true; render();
    try { if (session.mode === 'cleanup') await cleanup(); else if (session.mode === 'follow') await followBack(); else if (session.mode === 'scan') await scan(); else await inspect(); }
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
  document.addEventListener('visibilitychange', () => { if (session?.status === 'running' && session.pauseOnFocusLoss !== false && document.visibilityState !== 'visible') void pause('Monitor hidden. Return to this tab and press Resume.'); });
  window.addEventListener('blur', () => { if (session?.status === 'running' && session.pauseOnFocusLoss !== false) void pause('Monitor lost focus. Return and press Resume.'); });
  // A removed monitor or changed account must stop progress even during a countdown.
  setInterval(() => { if (session?.status === 'running') { try { assertLocal(); } catch (error) { void pause(error.message); } } }, 500);
})();
