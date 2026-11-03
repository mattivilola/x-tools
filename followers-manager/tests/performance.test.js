import test from 'node:test';
import assert from 'node:assert/strict';
import { actionBatch, minimumDuration, randomActionDelaySeconds, mergeRecords, checkpointDue, ACTION_DELAY_MS, ACTION_DELAY_MIN_MS, ACTION_DELAY_MAX_MS } from '../src/performance.js';
import { makeSession } from '../src/session.js';

test('first five is a fixed bounded session, not an automatic continuation', () => {
  const queue = Array.from({ length: 12 }, (_, i) => ({ username: `person${i}` }));
  const input = { account: 'fixture', mode: 'follow', action: 'follow-all', authorization: 'written-permission', consent: true, queue };
  const first = makeSession({ ...input, batchSize: '5' });
  assert.equal(first.queue.length, 5);
  assert.deepEqual(first.queue.map((r) => r.username), queue.slice(0, 5).map((r) => r.username));
  assert.equal(first.batchSize, '5');
  assert.equal(first.delayMs, 6000);
  assert.equal(first.delayMinMs, 3000);
  assert.equal(first.delayMaxMs, 9000);
  assert.equal(makeSession(input).queue.length, 12);
  assert.equal(actionBatch(queue.slice(0, 2), '5').length, 2);
  assert.throws(() => actionBatch(queue, '10'), /Choose/);
  assert.equal(queue.length, 12);
});

test('incremental scan merge enriches records without duplicates or reordering', () => {
  const before = [{ username: 'alice', bio: 'old' }, { username: 'bruno' }];
  const after = mergeRecords(before, [{ username: 'alice', bio: 'new' }, { username: 'carl' }, { username: '!invalid' }]);
  assert.deepEqual(after.map((r) => r.username), ['alice', 'bruno', 'carl']);
  assert.equal(after[0].bio, 'new'); assert.equal(before[0].bio, 'old');
  assert.deepEqual(mergeRecords(before, [{ username: 'carl' }, { username: 'bruno', bio: 'enriched' }], 2), [before[0], { username: 'bruno', bio: 'enriched' }]);
});

test('scan checkpoints are paced and terminal or interrupted states always flush', () => {
  assert.equal(checkpointDue(1000, 5999, 'running'), false);
  assert.equal(checkpointDue(1000, 6000, 'running'), true);
  for (const state of ['paused', 'stopped', 'complete', 'error']) assert.equal(checkpointDue(1000, 1001, state), true);
  assert.equal(minimumDuration(5), '15s–45s (expected 30s)');
  assert.equal(minimumDuration(100), '5m–15m (expected 10m)');
  assert.equal(minimumDuration(0), '0s');
});

test('action countdown is uniformly sampled from inclusive whole seconds 3 through 9', () => {
  assert.equal(ACTION_DELAY_MIN_MS, 3000);
  assert.equal(ACTION_DELAY_MAX_MS, 9000);
  assert.equal(ACTION_DELAY_MS, 6000);
  const values = Array.from({ length: 7 }, (_, index) => randomActionDelaySeconds(() => (index + 0.5) / 7));
  assert.deepEqual(values, [3, 4, 5, 6, 7, 8, 9]);
  assert.equal((values[0] + values.at(-1)) / 2, 6);
  assert.equal(randomActionDelaySeconds(() => 0), 3);
  assert.equal(randomActionDelaySeconds(() => 1), 9);
  assert.throws(() => randomActionDelaySeconds(() => 0.5, 9, 3), /Invalid/);
  assert.equal(minimumDuration(1), '3s–9s (expected 6s)');
  assert.equal(minimumDuration(5, 8000, 8000), '40s');
});
