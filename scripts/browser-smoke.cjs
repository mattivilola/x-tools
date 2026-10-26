// Local fixture integration checks. Never uses a personal browser profile or live account.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { resolve, join } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(__dirname, '..');
const stage = fs.mkdtempSync(join(require('node:os').tmpdir(), 'followers-hero-smoke-'));
const profile = join(stage, 'profile'), extension = join(stage, 'extension');
const output = join(root, 'output', 'playwright');
fs.cpSync(join(root, 'followers-hero-image'), extension, { recursive: true });
// Fixture-only copy pregrants the exact optional origins so no native permission
// dialog is needed. Unit tests separately enforce production optional permissions.
const manifestPath = join(extension, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
manifest.host_permissions = manifest.optional_host_permissions;
delete manifest.optional_host_permissions;
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
let checks = 0;
const pass = (name) => { checks++; console.log(`PASS ${name}`); };
(async () => {
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.BROWSER_EXECUTABLE || undefined,
      headless: true, chromiumSandbox: true, timeout: 15000, acceptDownloads: true,
      viewport: { width: 1440, height: 1100 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--host-resolver-rules=MAP x.com 127.0.0.1, MAP pbs.twimg.com 127.0.0.1'],
      ignoreDefaultArgs: ['--disable-extensions'],
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const id = new URL(worker.url()).host;
    await worker.evaluate(() => {
      self.__fixtureTrace = [];
      chrome.runtime.onMessage.addListener((message) => { self.__fixtureTrace.push({ type: message.type, action: message.action }); });
      chrome.storage.onChanged.addListener((changes) => { if (changes.job) self.__fixtureTrace.push({ status: changes.job.newValue?.status, count: changes.job.newValue?.followers?.length }); });
    });
    const editor = await context.newPage(), errors = [];
    editor.on('pageerror', (error) => errors.push(error.message));
    let requests = 0;
    const cards = (start, count) => Array.from({ length: count }, (_, offset) => {
      const i = start + offset;
      return `<div data-testid="UserCell"><a href="/person${i}"><img width="24" height="24" src="https://pbs.twimg.com/profile_images/fixture/avatar.png"></a><span dir="ltr">Person ${i}</span></div>`;
    }).join('');
    await context.route('https://x.com/**', (route) => { requests++; return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>X local fixture</title>${cards(0, 10)}` }); });
    await context.route('https://pbs.twimg.com/**', (route) => { requests++; return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64') }); });
    await editor.goto(`chrome-extension://${id}/app.html`);
    await editor.waitForFunction(() => !document.getElementById('png').disabled);
    assert.equal(requests, 0); pass('offline demo makes no X requests');
    await editor.locator('#title').fill('Thank you, {count} people.');
    for (const layout of ['spotlight', 'grid', 'banner']) {
      await editor.locator('#layout').selectOption(layout);
      await editor.waitForFunction(() => !document.getElementById('png').disabled);
    }
    await editor.locator('#format').selectOption('portrait');
    await editor.waitForFunction(() => document.getElementById('poster').height === 1350 && !document.getElementById('png').disabled);
    pass('all compositions and portrait dimensions render');
    await editor.locator('#layout').selectOption('spotlight'); await editor.locator('#format').selectOption('square');
    await editor.waitForFunction(() => document.getElementById('poster').height === 1080 && !document.getElementById('png').disabled);
    fs.mkdirSync(output, { recursive: true });
    await editor.screenshot({ path: join(output, 'followers-hero-desktop.png'), fullPage: true });
    for (const format of ['png', 'jpeg']) {
      const pending = editor.waitForEvent('download'); await editor.locator(`#${format}`).click();
      const download = await pending, path = join(output, `demo-poster.${format === 'jpeg' ? 'jpg' : 'png'}`);
      await download.saveAs(path);
      assert.deepEqual([...fs.readFileSync(path).subarray(0, 2)], format === 'png' ? [137, 80] : [255, 216]);
    }
    pass('PNG and JPEG exports contain real image data');
    await editor.locator('summary').click(); await editor.locator('#username').fill('fixture');
    await editor.locator('#collect').click();
    assert.match(await editor.locator('#status').textContent(), /written authorization/);
    pass('website collection refuses missing authorization attestation');
    // Bind a controlled fixture tab to a job; start authorization and permission
    // decisions are covered separately by background.test.js. All collector and
    // overlay code, messaging and storage below run in the actual extension.
    const collector = await context.newPage(); collector.on('pageerror', (error) => errors.push(error.message));
    await collector.goto('https://x.com/fixture/followers');
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://x.com/fixture/followers' });
      await chrome.storage.local.set({ source: 'collected', job: { id: 'local-fixture', tabId: tab.id, username: 'fixture', target: 144, followers: [], authorization: 'written-permission', status: 'waiting', message: 'Local test fixture' } });
    });
    await collector.reload(); await collector.bringToFront();
    const overlay = collector.locator('followers-hero-monitor');
    await overlay.getByRole('button', { name: 'Start / Resume' }).waitFor();
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('job')).job.followers.length), 0);
    pass('large overlay waits for an explicit Start before reading any cards');
    await overlay.getByRole('button', { name: 'Start / Resume' }).click();
    const waitJob = async (status, count) => {
      const until = Date.now() + 15000;
      let job;
      while (Date.now() < until) {
        job = await worker.evaluate(async () => (await chrome.storage.local.get('job')).job);
        if ((!status || job?.status === status) && (count === null || job?.followers.length === count)) return job;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Expected ${status}/${count}; got ${job?.status}/${job?.followers.length}`);
    };
    await waitJob('collecting', 10);
    // Headless Chromium emulates focus; exercise the actual window-blur handler
    // explicitly rather than treating page.bringToFront as proof of OS focus.
    await collector.evaluate(() => window.dispatchEvent(new Event('blur')));
    await editor.bringToFront(); await waitJob('paused', 10);
    await collector.bringToFront();
    const resumedStatus = await worker.evaluate(async () => (await chrome.storage.local.get('job')).job.status);
    if (resumedStatus !== 'paused') console.error('Focus diagnostics', await worker.evaluate(() => self.__fixtureTrace));
    assert.equal(resumedStatus, 'paused');
    pass('focus-loss event pauses and returning does not resume automatically');
    await overlay.getByRole('button', { name: 'Start / Resume' }).click(); await waitJob('collecting', 10);
    await overlay.getByRole('button', { name: 'Pause', exact: true }).click(); await waitJob('paused', 10);
    pass('operator Pause stops collection and preserves partial progress');
    await collector.locator('body').evaluate((body, html) => body.insertAdjacentHTML('beforeend', html), cards(10, 150));
    await overlay.getByRole('button', { name: 'Start / Resume' }).click(); await waitJob('complete', 144);
    pass('explicit Resume deduplicates and stops at the exact target');
    await worker.evaluate(async () => {
      const { job } = await chrome.storage.local.get('job');
      await chrome.storage.local.set({ job: { ...job, id: 'local-stop-fixture', status: 'waiting', target: 200 } });
    });
    await collector.reload(); await collector.bringToFront();
    await overlay.getByRole('button', { name: 'Stop', exact: true }).click(); await waitJob('stopped', 144);
    pass('operator Stop ends the session and saves the partial list');
    await editor.bringToFront(); await editor.reload();
    await editor.waitForFunction(() => document.getElementById('count').textContent === '144 collected people');
    pass('saved collection survives editor reload');
    // Test local photo import and portable embedded-photo JSON without any remote fetch.
    const photo = await editor.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#756498'; x.fillRect(0, 0, 32, 32); return c.toDataURL('image/png').split(',')[1]; });
    const beforeImport = requests;
    await editor.locator('#photos').setInputFiles({ name: 'local-fixture.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });
    await editor.waitForFunction(() => document.getElementById('count').textContent === '1 imported people' && !document.getElementById('png').disabled);
    assert.equal(requests, beforeImport);
    const exportedPromise = editor.waitForEvent('download'); await editor.locator('#export').click();
    const exported = await exportedPromise; await exported.saveAs(join(output, 'local-photo-collection.json'));
    const payload = JSON.parse(fs.readFileSync(join(output, 'local-photo-collection.json'), 'utf8'));
    assert.match(payload.followers[0].avatar, /^data:image\/jpeg;base64,/);
    await editor.locator('#import').setInputFiles({ name: 'collection.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    await editor.waitForFunction(() => !document.getElementById('png').disabled);
    assert.equal(requests, beforeImport); pass('local photos and embedded-photo JSON round trip without network access');
    await editor.locator('#import').setInputFiles({ name: 'remote.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ followers: [{ username: 'remote', avatar: 'https://pbs.twimg.com/profile_images/not-fetched/avatar.jpg' }] })) });
    await editor.waitForFunction(() => document.getElementById('render-status').textContent.includes('unavailable'));
    assert.equal(requests, beforeImport); pass('JSON import never silently fetches remote avatar URLs');
    await editor.locator('#clear').click(); await editor.locator('#cancel-clear').click();
    assert.equal(await editor.locator('#count').textContent(), '1 imported people');
    await editor.locator('#clear').click(); await editor.locator('#confirm-clear').click();
    await editor.waitForFunction(() => document.getElementById('count').textContent === 'Demo community');
    await editor.waitForFunction(() => !document.getElementById('png').disabled);
    assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('job')).job), undefined);
    pass('clear confirms before removing saved data');
    await editor.setViewportSize({ width: 390, height: 844 });
    await editor.screenshot({ path: join(output, 'followers-hero-mobile.png'), fullPage: true });
    assert.equal(await editor.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []); pass('mobile editor fits without overflow or JavaScript errors');
    console.log(JSON.stringify({ checks, output, note: 'Local fixtures only; production optional-permission denial requires manual verification.' }));
  } finally {
    if (context) await context.close();
    fs.rmSync(stage, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
