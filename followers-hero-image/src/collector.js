(() => {
  if (globalThis.__followersHeroMonitor) return;
  globalThis.__followersHeroMonitor = true;
  let job, active = null, host, view;
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const send = (data) => chrome.runtime.sendMessage({ ...data, id: job.id });
  function render(status, message) {
    if (!view) return;
    view.querySelector('#state').textContent = status;
    view.querySelector('#activity').textContent = message;
    view.querySelector('#count').textContent = `${job.followers.length} / ${job.target} people saved`;
    view.querySelector('progress').max = job.target;
    view.querySelector('progress').value = job.followers.length;
    view.querySelector('#start').disabled = Boolean(active) || ['complete', 'stopped'].includes(status);
    view.querySelector('#pause').disabled = !active;
    view.querySelector('#stop').disabled = ['complete', 'stopped'].includes(status);
  }
  function monitored() {
    return !document.hidden && document.hasFocus() && host?.isConnected && getComputedStyle(host).display !== 'none' && host.getBoundingClientRect().width > 0;
  }
  async function pause(reason) {
    active = null;
    render('paused', reason);
    await send({ type: 'FH_CONTROL', action: 'pause' }).catch(() => {});
  }
  function scan() {
    const followers = [];
    for (const cell of document.querySelectorAll('[data-testid="UserCell"]')) {
      const link = [...cell.querySelectorAll('a[href]')].find((a) => /^\/[A-Za-z0-9_]{1,15}$/.test(new URL(a.href, location.origin).pathname) && a.querySelector('img'));
      if (!link) continue;
      const handle = new URL(link.href, location.origin).pathname.slice(1);
      followers.push({ username: handle, name: cell.querySelector('[dir="ltr"]')?.textContent || handle, avatar: cell.querySelector('img[src*="pbs.twimg.com/profile_images/"]')?.src || '' });
    }
    return followers;
  }
  async function run(token) {
    let idle = 0;
    const seen = new Set(), startedAt = Date.now();
    while (active === token) {
      if (!monitored()) { await pause('Paused: keep this followers tab visible and focused, with the monitor on screen.'); break; }
      if (location.origin !== 'https://x.com' || location.pathname.replace(/\/$/, '').toLowerCase() !== `/${job.username}/followers` || Date.now() - startedAt > 20 * 60 * 1000) {
        await pause('Paused: the page changed or the 20-minute session limit was reached.'); break;
      }
      const added = scan().filter((person) => !seen.has(person.username.toLowerCase()));
      added.forEach((person) => seen.add(person.username.toLowerCase()));
      if (added.length) {
        idle = 0;
        render('collecting', `Reading ${added.length} newly visible people…`);
        const response = await send({ type: 'FH_BATCH', followers: added });
        if (active !== token) break;
        if (!response?.ok) { await pause('Paused: the extension rejected this batch. Reopen the editor.'); break; }
        job.followers.length = response.count;
        if (response.stop) { active = null; render('complete', 'Target reached. Collection stopped; open the editor to create your image.'); break; }
      } else idle++;
      if (idle >= 10) { active = null; await send({ type: 'FH_END' }); render('paused', 'No new people for 30 seconds. Check for loading errors or restrictions before resuming.'); break; }
      render('collecting', 'Waiting 3 seconds, then scrolling once. Watch for errors or restrictions and stop if anything looks wrong.');
      await delay(3000);
      if (active !== token) break;
      if (!monitored()) { await pause('Paused: this tab lost visibility or focus.'); break; }
      window.scrollBy({ top: Math.max(300, innerHeight * .65), behavior: 'instant' });
    }
  }
  function mount() {
    host = document.createElement('followers-hero-monitor');
    host.style.cssText = 'all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;width:min(440px,calc(100vw - 40px))!important;z-index:2147483647!important;display:block!important;';
    view = host.attachShadow({ mode: 'open' });
    view.innerHTML = `<style>:host{font-family:system-ui,sans-serif;color:#26302f}section{background:white;border:3px solid #6e5a9c;border-radius:16px;padding:22px;box-shadow:0 8px 48px #0005}h2{font-size:20px;margin:0 0 12px}p{font-size:13px;line-height:1.5;margin:10px 0}strong{font-size:15px}progress{width:100%;height:16px;accent-color:#6e5a9c}.buttons{display:flex;gap:8px;margin:16px 0}button{font:600 14px system-ui;padding:12px;flex:1;border:1px solid #68528e;border-radius:7px;background:#fff;color:#362653;cursor:pointer}#start{background:#59457e;color:#fff}#stop{border-color:#a33;color:#a33}button:disabled{opacity:.5;cursor:default}.warning{background:#fff2d6;color:#624712;padding:10px;border-radius:6px}#activity{min-height:40px}small{font-size:11px;line-height:1.4;display:block}</style><section role="region" aria-label="Followers Hero collection monitor"><h2>Followers Hero · stay and monitor</h2><strong id="state">waiting</strong><p id="account"></p><p id="count"></p><progress aria-label="Collection progress"></progress><p id="activity" role="status" aria-live="polite"></p><div class="buttons"><button id="start">Start / Resume</button><button id="pause">Pause</button><button id="stop">Stop</button></div><p class="warning">Keep watching this tab continuously. Pause or stop at any time. Switching tabs or windows pauses collection.</p><small>Supervision does not make scraping permitted. Website collection requires X’s written authorization. Stop on any warning, challenge or restriction. No guarantee against account enforcement.</small></section>`;
    view.querySelector('#account').textContent = `Account: @${job.username}. Only visible follower cards are read.`;
    document.documentElement.append(host);
    view.querySelector('#start').addEventListener('click', async (event) => {
      if (!event.isTrusted || active || !monitored()) return;
      const token = {}; active = token;
      render('waiting', 'Requesting start…');
      const response = await send({ type: 'FH_CONTROL', action: 'start' });
      if (active !== token || !monitored()) { await pause('Paused: focus or operator state changed while starting.'); return; }
      if (!response?.ok) { active = null; render('paused', 'Could not start. Check the editor and your site permissions.'); return; }
      job = response.job;
      render('collecting', 'Reading visible people…');
      run(token).catch(() => pause('Paused after an error. Check X before trying again.'));
    });
    view.querySelector('#pause').addEventListener('click', (event) => { if (event.isTrusted) pause('Paused by you. Progress saved.'); });
    view.querySelector('#stop').addEventListener('click', async (event) => {
      if (!event.isTrusted) return;
      active = null; await send({ type: 'FH_CONTROL', action: 'stop' }); render('stopped', 'Stopped by you. Your partial collection is saved.');
    });
    render('waiting', 'Nothing is being collected. Click Start / Resume when you are ready to monitor.');
  }
  document.addEventListener('visibilitychange', () => { if (active && document.hidden) pause('Paused: you switched away from this tab.'); });
  window.addEventListener('blur', () => { if (active) pause('Paused: this window lost focus.'); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.job || !job) return;
    const next = changes.job.newValue;
    if (!next || next.id !== job.id) { active = null; render('stopped', 'This collection was replaced or cleared in the editor.'); return; }
    job = next;
    if (job.status !== 'collecting') active = null;
    render(job.status, job.message);
  });
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === 'FH_RUN') {
      active = null; job = message.job;
      if (!host?.isConnected) mount();
      else render('waiting', 'Click Start / Resume when you are ready to monitor.');
      reply({ ok: true });
    }
    if (message.type === 'FH_PAUSE' || message.type === 'FH_STOP') { active = null; render(message.type === 'FH_STOP' ? 'stopped' : 'paused', 'Progress saved.'); reply({ ok: true }); }
  });
})();
