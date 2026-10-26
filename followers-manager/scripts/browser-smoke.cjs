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
  const cards = ['alice', 'bruno'].map((name, i) => `<div data-testid="UserCell" style="padding:25px;margin:20px;width:500px;border:1px solid #ccc"><a href="/${name}">${name} fixture</a><div data-testid="UserDescription">Synthetic profile</div><button data-testid="${101 + i}-unfollow" onclick="openConfirm('${name}',${101 + i},this)">Following</button></div>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>X local fixture</title><body style="font:16px system-ui;padding:40px"><a data-testid="AppTabBar_Profile_Link" href="/fixture">Your profile</a><h1>Local X fixture</h1>${cards}<script>
  window.fixtureClicks=0;
  function openConfirm(name,id,button){const dialog=document.createElement('div');dialog.dataset.testid='confirmationSheetDialog';dialog.setAttribute('role','alertdialog');dialog.innerHTML='<p>Unfollow @'+(window.fixtureWrong?'wrongaccount':name)+'?</p><button data-testid="confirmationSheetConfirm">Unfollow</button><button data-testid="confirmationSheetCancel">Cancel</button>';document.body.append(dialog);dialog.querySelector('[data-testid=confirmationSheetCancel]').onclick=()=>dialog.remove();dialog.querySelector('[data-testid=confirmationSheetConfirm]').onclick=()=>{window.fixtureClicks++;button.dataset.testid=id+'-follow';button.textContent='Follow';dialog.remove();};}
  </script></body>`;
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
    const id = new URL(worker.url()).host;
    const app = await context.newPage(); app.on('pageerror', (error) => errors.push(error.message));
    await app.goto(`chrome-extension://${id}/app.html`);
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
    await scan.locator('.status').filter({ hasText: 'No more cards observed' }).waitFor({ timeout: 18000 });
    assert.equal(await scan.evaluate(() => window.fixtureClicks), 0);
    await app.bringToFront(); await app.locator('#save-scan').click(); assert.equal(await app.locator('#coverage').isChecked(), false);
    await app.locator('#confirm-save').click(); await app.waitForFunction(() => document.getElementById('coverage-info').textContent.includes('Coverage: partial'));
    assert.equal(await app.locator('#lost-total').textContent(), 'Unknown');
    check('a real rendered-card scan saves partial coverage and cannot invent follower losses');
    assert.deepEqual(errors, []); check('no page errors occur');
    console.log(`Screenshots: ${output}`);
  } finally { if (context) await context.close(); rmSync(temporary, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
