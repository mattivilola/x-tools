export const PAGE_SIZE = 50;
export const ACTION_DELAY_MS = 6000;
export const ACTION_DELAY_MIN_MS = 3000;
export const ACTION_DELAY_MAX_MS = 9000;
export const CHECKPOINT_MS = 5000;

export function actionBatch(queue, size = 'all') {
  if (!['all', '5'].includes(size)) throw new Error('Choose all reviewed accounts or the first 5.');
  return size === '5' ? queue.slice(0, 5) : queue.slice();
}

function formatDuration(seconds) {
  const rounded = Math.ceil(Math.max(0, seconds));
  const minutes = Math.floor(rounded / 60), rest = rounded % 60;
  return minutes ? `${minutes}m${rest ? ` ${rest}s` : ''}` : `${rest}s`;
}

export function minimumDuration(count, minDelayMs = ACTION_DELAY_MIN_MS, maxDelayMs = ACTION_DELAY_MAX_MS) {
  const actions = Math.max(0, Math.floor(Number(count) || 0));
  if (actions === 0) return '0s';
  const minMs = Math.max(0, Number(minDelayMs) || 0);
  const maxMs = Math.max(minMs, Number(maxDelayMs) || minMs);
  const minSeconds = Math.ceil(actions * minMs / 1000);
  const maxSeconds = Math.ceil(actions * maxMs / 1000);
  if (minMs === maxMs) return formatDuration(minSeconds);
  const expectedSeconds = Math.ceil(actions * (minMs + maxMs) / 2000);
  return `${formatDuration(minSeconds)}–${formatDuration(maxSeconds)} (expected ${formatDuration(expectedSeconds)})`;
}

export function randomActionDelaySeconds(random = Math.random, minSeconds = 3, maxSeconds = 9) {
  const low = Math.ceil(minSeconds), high = Math.floor(maxSeconds);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) throw new Error('Invalid action delay range.');
  const sample = Math.min(1 - Number.EPSILON, Math.max(0, Number(random())));
  return low + Math.floor(sample * (high - low + 1));
}

// Incremental arrivals preserve scan order and enrich existing records without duplicates.
export function mergeRecords(records, changes, limit = 10000) {
  const merged = new Map(records.map((row) => [row.username, row]));
  for (const row of changes) {
    if (!row || !/^[a-z0-9_]{1,15}$/.test(row.username)) continue;
    if (merged.has(row.username) || merged.size < limit) merged.set(row.username, row);
  }
  return [...merged.values()];
}

export function checkpointDue(last, now, status) {
  return status !== 'running' || now - last >= CHECKPOINT_MS;
}
