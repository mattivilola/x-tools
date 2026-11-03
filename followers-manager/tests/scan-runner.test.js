import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { mergeRecords } from '../src/performance.js';

// Execute the production scan loop with a synthetic rendered-list driver. No
// browser, network, account data, or substituted scan policy is involved.
const runner = readFileSync(new URL('../src/runner.js', import.meta.url), 'utf8');
const scanSource = runner.slice(runner.indexOf('  async function scan() {'), runner.indexOf('  async function inspect() {'));
function harness(count = 200) {
  const list = { start: 0, count, scrollTop: 0, scrollHeight: count * 44, viewportHeight: 380, loading: false };
  const session = { mode: 'scan', status: 'running', records: [], scanRetriesRemaining: 0 };
  const updates = [], waits = [];
  let onWait = () => {};
  const context = vm.createContext({ session, seen: new Map(),
    cells: () => Array.from({ length: list.count }, (_, i) => ({ username: `user${list.start + i}`, bio: 'Synthetic bio' })),
    recordOf: (row) => row,
    readers: { listState: () => ({ ...list, atBottom: list.scrollTop + list.viewportHeight >= list.scrollHeight }),
      scrollList: (pixels) => { list.scrollTop = Math.min(list.scrollTop + pixels, Math.max(0, list.scrollHeight - list.viewportHeight)); } },
    guard: async () => { if (session.status !== 'running') throw new Error('Guard stopped the scan.'); },
    wait: async (ms) => { waits.push(ms); onWait(ms); },
    message: async (_type, patch) => {
      updates.push(structuredClone(patch));
      if (patch.recordChanges) session.records = mergeRecords(session.records, patch.recordChanges);
      if (patch.retryUsed) session.scanRetriesRemaining--;
      if (patch.status) session.status = patch.status;
      return session;
    },
  });
  vm.runInContext(`${scanSource}\nglobalThis.executeScan = scan;`, context);
  return { list, session, updates, waits, run: () => context.executeScan(), onWait: (fn) => { onWait = fn; } };
}

test('reading 200 mounted cards keeps scrolling until the loaded bottom; stall requests review, never completion', async () => {
  const h = harness(); await h.run();
  assert.equal(h.session.records.length, 200);
  assert.equal(h.list.scrollTop, h.list.scrollHeight - h.list.viewportHeight);
  assert.equal(h.session.status, 'paused');
  assert.equal(h.updates.at(-1).scanReview, 'stalled');
  assert.equal(h.updates.some((p) => p.status === 'complete'), false);
  assert.ok(h.waits.length > 8, 'moving through mounted cards must not hit the eight-idle-poll threshold');
});

test('resuming after a delayed virtualized page preserves 200 earlier records and adds the next 100', async () => {
  const h = harness(); await h.run();
  h.list.start = 200; h.list.count = 100; h.list.scrollTop = 0; h.list.scrollHeight = 4400;
  h.session.status = 'running'; await h.run();
  assert.equal(h.session.records.length, 300);
  assert.equal(new Set(h.session.records.map((r) => r.username)).size, 300);
  assert.equal(h.session.status, 'paused');
  assert.equal(h.updates.some((p) => p.status === 'complete'), false);
});

test('explicit Auto Retry consumes three attempts with 2/4/8-second waits then returns to review', async () => {
  const h = harness(2); h.session.scanRetriesRemaining = 3; await h.run();
  assert.equal(h.updates.filter((p) => p.retryUsed).length, 3);
  assert.equal(h.waits.filter((ms) => ms === 500).reduce((total, ms) => total + ms, 0), 14000);
  assert.equal(h.session.scanRetriesRemaining, 0);
  assert.equal(h.session.status, 'paused'); assert.equal(h.updates.at(-1).scanReview, 'stalled');
});

test('Pause interrupts an automatic loading wait without another retry or completion', async () => {
  const h = harness(2); h.session.scanRetriesRemaining = 3;
  h.onWait((ms) => { if (ms === 500) h.session.status = 'paused'; });
  await assert.rejects(h.run(), /Guard stopped/);
  assert.equal(h.updates.filter((p) => p.retryUsed).length, 1);
  assert.equal(h.updates.some((p) => p.status === 'complete'), false);
});
