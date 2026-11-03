// Fixture-only extension integration. Never visits a live signed-in X account.
// On macOS run in the approved browser execution context, starting with --preflight.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, cpSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(__dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'followers-manager-smoke-'));
const extension = join(temporary, 'extension');
const output = join(root, '../output/playwright');
cpSync(root, extension, { recursive: true, filter: (src) => !src.includes('/node_modules') });
// The isolated fixture extension simulates an already-granted optional host permission.
// Production keeps its optional-permission prompt. No real account or data is involved.
const manifest = JSON.parse(readFileSync(join(extension, 'manifest.json')));
manifest.host_permissions = manifest.optional_host_permissions; delete manifest.optional_host_permissions;
writeFileSync(join(extension, 'manifest.json'), JSON.stringify(manifest));
let context;
const errors = [];
const check = (label) => console.log(`PASS ${label}`);
function snapshot(time, followers) {
  const records = [{ id: '101', username: 'alice', name: 'Alice Fixture', bio: 'Synthetic profile' }, { id: '102', username: 'bruno', name: 'Bruno Fixture', bio: 'Synthetic profile' }];
  return { account: 'fixture', observedAt: time, source: 'synthetic-fixture', coverage: 'complete', followers: records.filter((r) => followers.includes(r.username)), following: records, followerCount: followers.length, followingCount: 2 };
}
function fixture(path) {
  const followerPage = path.endsWith('/followers');
  const cards = ['alice', 'bruno'].map((name, i) => `<div data-testid="UserCell" role="button" style="padding:25px;margin:20px;width:500px;border:1px solid #ccc"><a href="/${name}"><span dir="auto">${name} fixture</span>${i === 0 ? '<svg aria-label="Verified account"></svg>' : ''}</a><a href="/${name}"><span dir="auto">@${name}</span></a>${i === 0 ? '<span data-testid="userFollowIndicator">Follows you</span>' : ''}<div dir="auto">Builds synthetic tools with <a href="/otherperson">@otherperson</a>.</div><button data-testid="${101 + i}-${followerPage ? 'follow' : 'unfollow'}" onclick="${followerPage ? 'followPerson' : 'openConfirm'}('${name}',${101 + i},this)">${followerPage ? 'Follow back' : 'Following'}</button></div>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>X local fixture</title><body style="font:16px system-ui;padding:40px"><a data-testid="AppTabBar_Profile_Link" href="/fixture">Your profile</a><h1>Local X fixture</h1>${cards}<script>
  window.fixtureClicks=0; window.fixtureFollows=0;
  function followPerson(name,id,button){window.fixtureFollows++;window.recordFixtureAction('follow',name);button.dataset.testid=id+'-unfollow';button.textContent='Following';}
  function openConfirm(name,id,button){const dialog=document.createElement('div');dialog.dataset.testid='confirmationSheetDialog';dialog.setAttribute('role','alertdialog');dialog.innerHTML='<p>Unfollow @'+(window.fixtureWrong?'wrongaccount':name)+'?</p><button data-testid="confirmationSheetConfirm">Unfollow</button><button data-testid="confirmationSheetCancel">Cancel</button>';document.body.append(dialog);dialog.querySelector('[data-testid=confirmationSheetCancel]').onclick=()=>dialog.remove();dialog.querySelector('[data-testid=confirmationSheetConfirm]').onclick=()=>{window.fixtureClicks++;window.recordFixtureAction('unfollow',name);button.dataset.testid=id+'-follow';button.textContent='Follow';dialog.remove();};}
  </script></body>`;
}
function pagedListFixture(direction, delayed) {
  return `<!doctype html><meta charset="utf-8"><title>Paged list fixture</title><style>body{font:16px system-ui;padding:20px}.card{height:44px}#list{height:380px;overflow-y:auto;width:580px;border:1px solid}</style>
  <a data-testid="AppTabBar_Profile_Link" href="/fixture">Your profile</a><main data-testid="primaryColumn"><div id="list"><div id="cards"></div><div id="loader" role="progressbar" hidden>Loading more accounts</div></div></main>
  <aside data-testid="sidebarColumn"><div data-testid="UserCell"><a href="/sidebar">Sidebar suggestion</a><button data-testid="99999-follow">Follow</button></div></aside>
  <script>const list=document.getElementById('list'),cards=document.getElementById('cards'),loader=document.getElementById('loader');let page=0,pending=false;
  function render(start,end){cards.innerHTML=Array.from({length:end-start},(_,j)=>{const i=start+j;return '<div class="card" data-testid="UserCell" role="button"><a href="/listuser'+i+'">Person '+i+'</a><div dir="auto">Synthetic list bio '+i+'</div><button data-testid="'+(1000+i)+'-${direction === 'following' ? 'unfollow' : 'follow'}">${direction === 'following' ? 'Following' : 'Follow back'}</button></div>';}).join('');}
  render(0,200);list.addEventListener('scroll',()=>{if(page||pending||list.scrollTop+list.clientHeight<list.scrollHeight-5)return;pending=true;loader.hidden=false;setTimeout(()=>{page=1;loader.hidden=true;render(200,300);list.scrollTop=0;pending=false;},${delayed ? 18000 : 120});});</script>`;
}
(async () => {
  try {
    context = await chromium.launchPersistentContext(join(temporary, 'profile'), {
      executablePath: process.env.BROWSER_EXECUTABLE || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      headless: true, chromiumSandbox: true, timeout: 15000, viewport: { width: 1440, height: 1050 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`], ignoreDefaultArgs: ['--disable-extensions'],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    check('selected Edge browser starts and loads the extension worker');
    if (process.argv.includes('--preflight')) return;
    let xRequests = 0;
    await context.route('https://x.com/**', (route) => { xRequests++; return route.fulfill({ contentType: 'text/html', body: fixture(new URL(route.request().url()).pathname) }); });
    // chrome.tabs.create's initial navigation can outrun Playwright target attachment.
    // Open its owned tab blank, then navigate via the attached Page so the fixture
    // handler always fulfills the request before any live network access.
    await worker.evaluate(() => {
      const create = chrome.tabs.create.bind(chrome.tabs);
      chrome.tabs.create = (options) => create({ ...options, url: options.url?.startsWith('https://x.com/') ? 'about:blank' : options.url });
    });
    const actions = new Map();
    await context.exposeBinding('recordFixtureAction', ({ page }, kind, name) => {
      const log = actions.get(page) || []; log.push({ kind, name }); actions.set(page, log);
    });
    const countActions = (page, kind) => (actions.get(page) || []).filter((r) => r.kind === kind).length;
    const id = new URL(worker.url()).host;
    const app = await context.newPage(); app.on('pageerror', (error) => errors.push(error.message));
    await app.goto(`chrome-extension://${id}/app.html`);
    async function completeAndReturn(page, timeout = 30000) {
      if (!page.isClosed()) await page.waitForEvent('close', { timeout });
      await app.waitForFunction(() => document.getElementById('session-title').textContent.includes('complete'));
      assert.equal(await app.evaluate(() => document.visibilityState), 'visible', 'completion activates the existing dashboard');
    }
    async function reviewAndFinish(page, timeout = 25000) {
      await page.locator('#fm-scan-review').waitFor({ state: 'visible', timeout });
      assert.equal(page.isClosed(), false, 'idle scans keep their processing tab open');
      await page.bringToFront(); await page.locator('#fm-finish-scan').click(); await completeAndReturn(page);
    }
    if (!process.argv.includes('--follow-only')) {
    await app.locator('#demo').click(); await app.waitForFunction(() => document.querySelectorAll('#people tr').length === 5);
    assert.equal(await app.locator('#total').textContent(), '4'); assert.equal(xRequests, 0);
    assert.equal(await app.locator('#review-cleanup').isDisabled(), true);
    await app.locator('#filter').selectOption('review'); assert.equal(await app.locator('#people tr').count(), 1);
    assert.match(await app.locator('#people').textContent(), /demosparse/);
    await app.locator('#filter').selectOption('all');
    check('offline demo renders history and cannot start account actions');
    mkdirSync(output, { recursive: true });
    await app.screenshot({ path: join(output, 'followers-manager-dashboard.png'), fullPage: true });
    await app.setViewportSize({ width: 390, height: 844 });
    assert.equal(await app.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await app.screenshot({ path: join(output, 'followers-manager-mobile.png'), fullPage: true });
    check('mobile dashboard fits without horizontal page overflow');
    await app.setViewportSize({ width: 1440, height: 1050 }); await app.locator('#demo').click(); await app.locator('#account').fill('fixture'); await app.locator('#account').dispatchEvent('change');
    await app.locator('.import-menu summary').click();
    for (const data of [snapshot(new Date(Date.now() - 86400000).toISOString(), ['alice','bruno']), snapshot(new Date().toISOString(), ['alice'])]) {
      await app.locator('#import').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await app.waitForFunction(() => document.getElementById('import').value === '');
    }
    assert.equal(await app.locator('#lost-total').textContent(), '1');
    await app.locator('.import-menu summary').click();
    await app.getByRole('button', { name: 'Protect @bruno', exact: true }).click();
    assert.equal(await app.getByRole('checkbox', { name: 'Select @bruno', exact: true }).isDisabled(), true);
    await app.getByRole('button', { name: 'Unprotect @bruno', exact: true }).click();
    await app.getByRole('checkbox', { name: 'Select @alice', exact: true }).check(); await app.getByRole('checkbox', { name: 'Select @bruno', exact: true }).check();
    await app.locator('#review-cleanup').click();
    await app.locator('#start-cleanup').click(); assert.equal(xRequests, 0);
    await app.locator('#authorization').check(); await app.locator('#accept').check();
    const monitorPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const monitor = await monitorPromise;
    monitor.on('pageerror', (error) => errors.push(error.message)); await monitor.bringToFront();
    await monitor.goto('https://x.com/fixture/following');
    try { await monitor.locator('#fm-resume').waitFor({ state: 'visible', timeout: 10000 }); }
    catch (error) {
      console.error('Monitor diagnostics', JSON.stringify({ url: monitor.url(), pages: context.pages().map((p) => p.url()), errors, state: await worker.evaluate(() => chrome.storage.local.get(null)), html: (await monitor.content()).slice(-3000) }));
      throw error;
    }
    assert.equal(await monitor.evaluate(() => window.fixtureClicks), 0);
    check('per-session attestations and explicit on-page Begin precede any action');
    await monitor.locator('#fm-resume').click(); await monitor.locator('.timer').filter({ hasText: /Unfollowing/ }).waitFor();
    await monitor.locator('#fm-pause').click(); await monitor.waitForTimeout(1200); assert.equal(await monitor.evaluate(() => window.fixtureClicks), 0);
    await monitor.locator('#fm-resume').click(); await monitor.locator('.timer').filter({ hasText: /Unfollowing/ }).waitFor();
    await app.bringToFront(); await app.waitForFunction(async () => (await chrome.storage.local.get('fmSession')).fmSession.status === 'paused');
    assert.equal(await monitor.evaluate(() => window.fixtureClicks), 0);
    check('Pause and tab focus loss prevent the pending destructive click');
    await monitor.bringToFront(); await monitor.locator('#fm-resume').click();
    await monitor.waitForFunction(() => window.fixtureClicks === 1, null, { timeout: 20000 });
    await monitor.locator('.progress-text').filter({ hasText: '1 of 2' }).waitFor();
    await monitor.screenshot({ path: join(output, 'followers-manager-overlay.png'), fullPage: true });
    await monitor.locator('#fm-stop').click(); await monitor.waitForTimeout(1300);
    assert.equal(await monitor.evaluate(() => window.fixtureClicks), 1);
    const final = await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession);
    assert.equal(final.status, 'stopped'); assert.equal(final.results[0].outcome, 'confirmed');
    check('runner verifies the matching account and confirmation, logs success, and Stop prevents the next unfollow');
    await app.bringToFront(); await app.reload(); await app.waitForFunction(() => document.getElementById('lost-total').textContent === '1');
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession)).status, 'stopped');
    check('history persists and stopped sessions do not restart');
    // A different account named in a dialog must never be confirmed.
    await app.getByRole('checkbox', { name: 'Select @bruno', exact: true }).check(); await app.locator('#review-cleanup').click();
    await app.locator('#authorization').check(); await app.locator('#accept').check();
    const wrongPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const wrong = await wrongPromise;
    await wrong.goto('https://x.com/fixture/following'); await wrong.bringToFront(); await wrong.locator('#fm-resume').waitFor();
    await wrong.evaluate(() => { window.fixtureWrong = true; }); await wrong.locator('#fm-resume').click();
    await wrong.locator('.status').filter({ hasText: 'expected confirmation did not appear' }).waitFor({ timeout: 18000 });
    assert.equal(await wrong.evaluate(() => window.fixtureClicks), 0);
    await wrong.locator('#fm-stop').click(); check('a mismatched confirmation pauses without submitting an unfollow');
    await app.bringToFront(); await app.locator('#scan-following').click(); await app.locator('#authorization').check(); await app.locator('#accept').check();
    const scanPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const scan = await scanPromise;
    await scan.goto('https://x.com/fixture/following'); await scan.bringToFront(); await scan.locator('#fm-resume').click();
    await reviewAndFinish(scan, 18000);
    assert.equal(countActions(scan, 'unfollow'), 0);
    assert.equal(await app.locator('#scan-save').isVisible(), true, 'the save form opens automatically after a completed scan');
    assert.equal(await app.locator('#coverage').isChecked(), false);
    await app.locator('#confirm-save').click(); await app.waitForFunction(() => document.getElementById('coverage-info').textContent.includes('Coverage: partial'));
    assert.equal(await app.locator('#lost-total').textContent(), 'Unknown');
    assert.equal(await app.locator('#scan-save').isHidden(), true);
    await app.reload(); await app.locator('#total').waitFor();
    assert.equal(await app.locator('#scan-save').isHidden(), true, 'saved scans do not reopen the save prompt on reload');
    check('stalled scans stay open for operator review; explicit finish opens the save form with coverage unchecked');

    const collected = await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession.records);
    assert.equal(collected.length, 2); assert.equal(collected[0].bioObserved, true);
    assert.match(collected[0].bio, /Builds synthetic tools with @otherperson/);
    assert.equal(collected[0].username, 'alice'); assert.equal(collected[0].verified, true);
    assert.equal(collected[0].followsYou, true); assert.equal(collected[1].followsYou, false);
    check('realistic list cards preserve bios with mentions, identity, verification and reciprocity');
    await app.locator('#filter').selectOption('nonfollower');
    assert.match(await app.locator('#people').textContent(), /bruno/); assert.doesNotMatch(await app.locator('#people').textContent(), /alice/);
    await app.locator('#filter').selectOption('all');

    await app.locator('#unfollow-nonfollowers').click();
    assert.match(await app.locator('#consent-list').textContent(), /bruno/); assert.doesNotMatch(await app.locator('#consent-list').textContent(), /alice/);
    await app.locator('#consent').getByRole('button', {name:'Cancel',exact:true}).click();
    await app.locator('#unfollow-all').click(); assert.match(await app.locator('#consent-description').textContent(), /2 selected/);
    await app.locator('#consent').getByRole('button', {name:'Cancel',exact:true}).click();
    check('both bulk unfollow shortcuts review the correct observed subsets without acting');

    await app.locator('#scan-following').click(); await app.locator('#pause-focus').uncheck();
    await app.locator('#authorization').check(); await app.locator('#accept').check();
    const bgPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const bg = await bgPromise;
    await bg.goto('https://x.com/fixture/following'); await bg.bringToFront(); await bg.locator('#fm-resume').click();
    await bg.locator('.status').filter({hasText:'observed accounts'}).waitFor(); await app.bringToFront();
    await bg.locator('#fm-scan-review').waitFor({ state: 'visible', timeout: 25000 });
    assert.equal(bg.isClosed(), false); await bg.bringToFront(); await bg.locator('#fm-scan-retry').click();
    await bg.locator('.status').filter({ hasText: 'Loading retry 1/3' }).waitFor({ timeout: 18000 });
    await bg.locator('#fm-pause').click(); await bg.waitForTimeout(2500);
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession)).status, 'paused');
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession)).scanRetriesRemaining, 0);
    await bg.locator('#fm-resume').click(); await reviewAndFinish(bg);
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession)).status, 'complete');
    assert.equal(countActions(bg, 'unfollow'), 0);
    check('background scans retain review controls; Auto Retry is opt-in and Pause cancels retries before explicit finish');

    for (const direction of ['following', 'followers']) {
      await context.route('https://x.com/**', (route) => route.fulfill({ contentType: 'text/html', body: pagedListFixture(direction, direction === 'following') }));
      await app.bringToFront(); await app.locator(`#scan-${direction}`).click();
      await app.locator('#authorization').check(); await app.locator('#accept').check();
      const pagesPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const pages = await pagesPromise;
      await pages.goto(`https://x.com/fixture/${direction}`); await pages.bringToFront(); await pages.locator('#fm-resume').click();
      if (direction === 'following') {
        await pages.locator('#fm-scan-review').waitFor({ state: 'visible', timeout: 45000 });
        const stalled = await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession);
        assert.equal(stalled.records.length, 200); assert.equal(stalled.status, 'paused'); assert.equal(pages.isClosed(), false);
        assert.equal(stalled.scanProgress.atBottom, true, 'scrolling through the already-read 200 cards must not count as a stall');
        await pages.locator('#fm-scan-retry').click();
      }
      await pages.locator('.progress-text').filter({ hasText: '300 accounts collected' }).waitFor({ timeout: 45000 });
      assert.equal(await pages.evaluate(() => document.querySelectorAll('#cards [data-testid="UserCell"]').length), 100, 'old cards are virtualized out but accumulated records survive');
      assert.equal(await pages.evaluate(() => scrollY), 0, 'the nested list, not the page, is scrolled');
      await pages.locator('#fm-pause').click();
      await pages.locator('#fm-resume').click(); await reviewAndFinish(pages, 25000);
      const collected = await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession);
      assert.equal(collected.records.length, 300); assert.equal(collected.records.some((r) => r.username === 'sidebar'), false);
      await app.locator('#confirm-save').click();
      check(`${direction} scan collects 300 virtualized accounts beyond an initial 200 in a nested scroller${direction === 'following' ? ', with explicit retry after a slow load' : ''}`);
    }
    await context.route('https://x.com/**', (route) => route.fulfill({ contentType: 'text/html', body: fixture(new URL(route.request().url()).pathname) }));

    } else {
      await app.locator('#account').fill('fixture'); await app.locator('#account').dispatchEvent('change');
    }

    const followerData = snapshot(new Date().toISOString(), ['alice','bruno']); followerData.following=[]; followerData.followingCount=0;
    followerData.followers[0].verified = true; followerData.followers[1].verified = false;
    await app.locator('.import-menu summary').click();
    await app.locator('#import').setInputFiles({name:'followers.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(followerData))});
    await app.waitForFunction(() => document.getElementById('import').value === ''); await app.locator('.import-menu summary').click();
    await app.locator('#follow-all').click(); assert.match(await app.locator('#consent-description').textContent(), /2 selected/);
    await app.locator('#consent').getByRole('button', {name:'Cancel',exact:true}).click();
    await app.locator('#follow-verified').click(); assert.match(await app.locator('#consent-description').textContent(), /1 selected/);
    assert.equal(await app.locator('#pause-focus').isChecked(), true, 'focus setting defaults on for every new session');
    await app.locator('#authorization').check(); await app.locator('#accept').check();
    const followPromise = context.waitForEvent('page', { timeout: 10000 }); await app.locator('#start-cleanup').click();
    let following;
    try { following = await followPromise; }
    catch (error) { console.error('Follow start diagnostics', JSON.stringify({notice:await app.locator('#notice').textContent(),session:await worker.evaluate(async ()=>(await chrome.storage.local.get('fmSession')).fmSession),dialog:await app.locator('#consent').textContent()})); throw error; }
    await following.goto('https://x.com/fixture/followers'); await following.bringToFront(); await following.locator('#fm-resume').click();
    await completeAndReturn(following, 18000);
    assert.equal(countActions(following, 'follow'), 1);
    const followed = await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession);
    assert.equal(followed.queue.length, 1); assert.equal(followed.queue[0].username, 'alice'); assert.equal(followed.results[0].outcome, 'confirmed');
    assert.equal(countActions(following, 'unfollow'), 0);
    assert.equal(await app.locator('#history-details').getAttribute('open') !== null, true);
    check('verified-only follow back rechecks its badge and confirms a Following result for the exact account');

    await app.bringToFront(); await app.locator('#follow-all').click(); await app.locator('#authorization').check(); await app.locator('#accept').check();
    const allPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const all = await allPromise;
    await all.goto('https://x.com/fixture/followers'); await all.bringToFront(); await all.locator('#fm-resume').waitFor();
    await all.evaluate(() => { const button = document.querySelector('[data-testid="102-follow"]'); button.dataset.testid='102-unfollow'; button.textContent='Following'; });
    await all.locator('#fm-resume').click(); await completeAndReturn(all, 27000);
    const allResult = await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession);
    assert.equal(allResult.queue.length, 1); assert.equal(allResult.queue[0].username, 'bruno');
    assert.equal(allResult.results[0].outcome, 'skipped'); assert.equal(allResult.results[0].detail, 'Already following.');
    assert.equal(countActions(all, 'follow'), 0); assert.equal(countActions(all, 'unfollow'), 0);
    check('confirmed prior follows are excluded, and newly observed already-followed accounts skip without a countdown');

    await app.bringToFront();
    const batchFollowers = Array.from({ length: 7 }, (_, i) => ({ username: `batch${i + 1}`, id: String(201 + i), verified: true, bio: 'Synthetic batch profile' }));
    const largeData = { account: 'fixture', observedAt: new Date().toISOString(), source: 'synthetic-fixture', coverage: 'complete',
      followers: batchFollowers, following: Array.from({ length: 123 }, (_, i) => ({ username: `entry${String(i).padStart(3, '0')}`, bio: 'Synthetic pagination profile' })) };
    await app.locator('.import-menu summary').click();
    await app.locator('#import').setInputFiles({ name: 'pagination.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(largeData)) });
    await app.waitForFunction(() => document.getElementById('import').value === ''); await app.locator('.import-menu summary').click();
    assert.equal(await app.locator('#people tr').count(), 50);
    assert.match(await app.locator('#page-summary').textContent(), /1–50 of 123/);
    await app.locator('#select-visible').click(); assert.equal(await app.locator('#selection-count').textContent(), '50 selected');
    const firstNodeRetained = await app.evaluate(() => { window.fixtureFirstRow = document.querySelector('#people tr'); return true; });
    assert.equal(firstNodeRetained, true);
    await app.locator('#clear-selection').click();
    assert.equal(await app.evaluate(() => window.fixtureFirstRow === document.querySelector('#people tr')), true, 'selection changes reuse the rendered row nodes');
    await app.locator('#select-visible').click(); await app.locator('#next-page').click(); await app.locator('#select-visible').click();
    assert.equal(await app.locator('#selection-count').textContent(), '100 selected');
    await app.locator('#next-page').click(); assert.equal(await app.locator('#people tr').count(), 23); assert.equal(await app.locator('#next-page').isDisabled(), true);
    await app.locator('#search').fill('entry122'); assert.equal(await app.locator('#people tr').count(), 1);
    assert.equal(await app.locator('#selection-count').textContent(), '100 selected');
    await app.locator('#search').fill(''); assert.match(await app.locator('#page-summary').textContent(), /1–50 of 123/);
    await app.locator('#clear-selection').click();
    check('50-row pagination, filtering, cross-page selection and row reuse work with 123 accounts');

    for (const action of ['follow-verified', 'follow-all', 'unfollow-all']) {
      await app.locator(`#${action}`).click(); await app.locator('#batch-size').selectOption('5');
      assert.match(await app.locator('#consent-description').textContent(), /5 selected accounts/);
      assert.equal(await app.locator('#consent-list li').count(), 5);
      assert.match(await app.locator('#duration-estimate').textContent(), /15s–45s \(expected 30s\)/);
      await app.locator('#consent').getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    // Seven eligible synthetic followers, but only the reviewed first five may act.
    await context.route('https://x.com/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Batch fixture</title><a data-testid="AppTabBar_Profile_Link" href="/fixture">Your profile</a>${batchFollowers.map((r) => `<div data-testid="UserCell" style="height:140px"><a href="/${r.username}">${r.username}<svg aria-label="Verified account"></svg></a><button data-testid="${r.id}-follow" onclick="window.fixtureFollows++;window.recordFixtureAction('follow','${r.username}');this.dataset.testid='${r.id}-unfollow';this.textContent='Following'">Follow back</button></div>`).join('')}<script>window.fixtureFollows=0;</script>` }));
    await app.locator('#follow-verified').click();
    assert.equal(await app.locator('#batch-size').inputValue(), 'all', 'each new review resets the batch choice');
    await app.locator('#batch-size').selectOption('5'); await app.locator('#authorization').check(); await app.locator('#accept').check();
    const batchPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const batch = await batchPromise;
    batch.on('pageerror', (error) => errors.push(error.message));
    await batch.goto('https://x.com/fixture/followers'); await batch.bringToFront(); await batch.locator('#fm-resume').click();
    await completeAndReturn(batch, 65000);
    const batchResult = await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession);
    assert.equal(batchResult.queue.length, 5); assert.equal(batchResult.index, 5); assert.equal(batchResult.results.length, 5);
    assert.equal(countActions(batch, 'follow'), 5);
    assert.deepEqual(actions.get(batch).map((r) => r.name), ['batch1', 'batch2', 'batch3', 'batch4', 'batch5']);
    await app.waitForTimeout(9000); assert.equal(countActions(batch, 'follow'), 5);
    check('first-five verified follow batch confirms five real fixture actions, completes and never follows the remaining two');

    await app.locator('#follow-verified').click();
    assert.equal(await app.locator('#consent-list li').count(), 2, 'the full batch excludes all five confirmed test targets');
    assert.doesNotMatch(await app.locator('#consent-list').textContent(), /@batch[1-5]\b/);
    await app.locator('#authorization').check(); await app.locator('#accept').check();
    const partialPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const partial = await partialPromise;
    await partial.goto('https://x.com/fixture/followers'); await partial.bringToFront(); await partial.locator('#fm-resume').click();
    await partial.locator('.progress-text').filter({ hasText: '1 of 2 processed' }).waitFor({ timeout: 16000 });
    await partial.locator('#fm-stop').click();
    assert.equal(countActions(partial, 'follow'), 1);
    await app.bringToFront(); await app.reload();
    await app.waitForFunction(() => document.getElementById('action-summary').textContent.includes('observed followers'));
    await app.locator('#follow-verified').click();
    assert.equal(await app.locator('#consent-list li').count(), 1);
    assert.match(await app.locator('#consent-list').textContent(), /@batch7/);
    await app.locator('#consent').getByRole('button', { name: 'Cancel', exact: true }).click();
    const retained = await worker.evaluate(async () => chrome.storage.local.get(['fmData', 'fmRelationships']));
    assert.equal(retained.fmRelationships.filter((r) => /^batch/.test(r.username) && r.isFollowing).length, 6);
    assert.equal(retained.fmData.snapshots.at(-1).following.length, 123, 'historical snapshots are not rewritten by current action status');
    check('first-five results and partial stopped results immediately persist across reloads and reduce the next full queue');

    const freshAt = new Date().toISOString();
    const protectedData = { account: 'fixture', observedAt: freshAt, source: 'synthetic-fixture', coverage: 'partial',
      followers: [{ username: 'mutual', id: '105' }], following: [
        { username: 'alice', id: '101', verified: true, followsYou: false, observedAt: freshAt },
        ...['bruno', 'carl', 'dora'].map((username, i) => ({ username, id: String(102 + i), verified: false, followsYou: false, observedAt: freshAt })),
        { username: 'mutual', id: '105', verified: false, followsYou: false, observedAt: freshAt },
        { username: 'unknown', id: '106', followsYou: false, observedAt: freshAt },
      ] };
    let protectedHtml = fixture('/following').replace('<script>', ['carl', 'dora'].map((name, i) => `<div data-testid="UserCell" style="height:120px"><a href="/${name}">${name}</a><button data-testid="${103 + i}-unfollow" onclick="openConfirm('${name}',${103 + i},this)">Following</button></div>`).join('') + '<script>');
    protectedHtml = protectedHtml.replace('document.body.append(dialog);', `document.body.append(dialog);if(name==='carl')button.parentElement.querySelector('a').insertAdjacentHTML('beforeend','<svg aria-label="Verified account"></svg>');if(name==='dora')button.parentElement.insertAdjacentHTML('beforeend','<span data-testid="userFollowIndicator">Follows you</span>');`);
    await context.route('https://x.com/**', (route) => route.fulfill({ contentType: 'text/html', body: protectedHtml }));
    await app.locator('.import-menu summary').click();
    await app.locator('#import').setInputFiles({ name: 'protected-cleanup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(protectedData)) });
    await app.waitForFunction(() => document.getElementById('import').value === ''); await app.locator('.import-menu summary').click();
    await app.locator('#unfollow-unverified-nonfollowers').click();
    assert.equal(await app.locator('#consent-list li').count(), 3);
    assert.doesNotMatch(await app.locator('#consent-list').textContent(), /@alice|@mutual|@unknown/);
    await app.locator('#batch-size').selectOption('5'); await app.locator('#authorization').check(); await app.locator('#accept').check();
    const protectedPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const protectedRun = await protectedPromise;
    await protectedRun.goto('https://x.com/fixture/following'); await protectedRun.bringToFront(); await protectedRun.locator('#fm-resume').click();
    await completeAndReturn(protectedRun, 40000);
    const protectedResult = await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession);
    assert.deepEqual(protectedResult.results.map((r) => [r.username, r.outcome]), [['bruno', 'confirmed'], ['carl', 'skipped'], ['dora', 'skipped']]);
    assert.deepEqual(actions.get(protectedRun), [{ kind: 'unfollow', name: 'bruno' }]);
    check('keep-verified-and-followers action excludes protected groups and cancels when a badge or follower relationship changes before confirmation');

    const missingData = { account: 'fixture', observedAt: new Date().toISOString(), source: 'synthetic-fixture', coverage: 'partial',
      followers: [{ username: 'ghost', id: '301', verified: true, isFollowing: false }], following: [] };
    await app.locator('.import-menu summary').click();
    await app.locator('#import').setInputFiles({ name: 'missing.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(missingData)) });
    await app.waitForFunction(() => document.getElementById('import').value === ''); await app.locator('.import-menu summary').click();
    await app.locator('#follow-verified').click(); await app.locator('#authorization').check(); await app.locator('#accept').check();
    const missingPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const missing = await missingPromise;
    await missing.goto('https://x.com/fixture/followers'); await missing.bringToFront(); await missing.locator('#fm-resume').click();
    await completeAndReturn(missing, 7000);
    const missingResult = await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession);
    assert.equal(missingResult.results[0].outcome, 'skipped'); assert.match(missingResult.results[0].detail, /relationship unknown/);
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get('fmRelationships')).fmRelationships)).some((r) => r.username === 'ghost'), false);
    check('a missing target is skipped after one look-ahead without recording an invented unfollow or relationship');

    const warningHtml = '<!doctype html><title>Restriction fixture</title><a data-testid="AppTabBar_Profile_Link" href="/fixture">Your profile</a><div data-testid="UserCell"><a href="/ghost">Ghost<svg aria-label="Verified account"></svg></a><button data-testid="301-follow" onclick="window.recordFixtureAction(\'follow\',\'ghost\')">Follow back</button></div>';
    await context.route('https://x.com/**', (route) => route.fulfill({ contentType: 'text/html', body: warningHtml }));
    await app.locator('#follow-verified').click(); await app.locator('#authorization').check(); await app.locator('#accept').check();
    const warningPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const warning = await warningPromise;
    await warning.goto('https://x.com/fixture/followers'); await warning.bringToFront(); await warning.locator('#fm-resume').click();
    await warning.locator('.timer').filter({ hasText: /Following @ghost/ }).waitFor();
    await warning.evaluate(() => { const alert = document.createElement('div'); alert.setAttribute('role', 'alert'); alert.textContent = 'You are unable to follow more people at this time. Try again later.'; document.body.append(alert); });
    await warning.locator('.badge').filter({ hasText: 'paused' }).waitFor({ timeout: 2500 });
    assert.equal(countActions(warning, 'follow'), 0);
    await warning.locator('#fm-stop').click();
    check('a visible follow limitation appearing during the randomized countdown pauses before any follow click');
    await app.bringToFront();
    await app.locator('#follow-verified').click(); await app.locator('#authorization').check(); await app.locator('#accept').check();
    const challengePromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const challenge = await challengePromise;
    await challenge.goto('https://x.com/fixture/followers'); await challenge.bringToFront();
    await challenge.evaluate(() => { const input = document.createElement('input'); input.dataset.testid = 'ocfEnterTextTextInput'; document.body.append(input); });
    await challenge.locator('#fm-resume').click(); await challenge.locator('.badge').filter({ hasText: 'paused' }).waitFor();
    assert.equal(countActions(challenge, 'follow'), 0); await challenge.locator('#fm-stop').click();
    check('a challenge prevents Begin without attempting to solve or bypass it');
    await app.bringToFront();
    await context.route('https://x.com/**', (route) => route.fulfill({ contentType: 'text/html', body: protectedHtml }));

    await app.locator('#scan-following').click(); await app.locator('#pause-focus').uncheck();
    await app.locator('#authorization').check(); await app.locator('#accept').check();
    const orphanPromise = context.waitForEvent('page'); await app.locator('#start-cleanup').click(); const orphan = await orphanPromise;
    await orphan.goto('https://x.com/fixture/following'); await orphan.bringToFront(); await orphan.locator('#fm-resume').click();
    const replacementPromise = context.waitForEvent('page', { timeout: 25000 }); await app.close();
    await orphan.locator('#fm-scan-review').waitFor({ state: 'visible', timeout: 18000 });
    assert.equal(orphan.isClosed(), false); await orphan.locator('#fm-finish-scan').click();
    const replacement = await replacementPromise; await replacement.locator('#scan-save').waitFor({ state: 'visible' });
    if (!orphan.isClosed()) await orphan.waitForEvent('close');
    assert.equal(await replacement.locator('#coverage').isChecked(), false);
    assert.equal(countActions(orphan, 'unfollow'), 0);
    assert.equal((await worker.evaluate(async () => (await chrome.storage.local.get('fmSession')).fmSession)).records.length, 4);
    check('a closed dashboard is reopened on scan completion with durable records and the save form ready');
    assert.deepEqual(errors, []); check('no page errors occur');
    console.log(`Screenshots: ${output}`);
  } finally { if (context) await context.close(); rmSync(temporary, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
