export const PAGE_SIZE = 50;
export const ACTION_DELAY_MS = 8000;
export const CHECKPOINT_MS = 5000;

export function actionBatch(queue, size = 'all') {
  if (!['all', '5'].includes(size)) throw new Error('Choose all reviewed accounts or the first 5.');
  return size === '5' ? queue.slice(0, 5) : queue.slice();
}

export function minimumDuration(count, delayMs = ACTION_DELAY_MS) {
  const seconds = Math.ceil(Math.max(0, count) * delayMs / 1000);
  const minutes = Math.floor(seconds / 60), rest = seconds % 60;
  return minutes ? `${minutes}m${rest ? ` ${rest}s` : ''}` : `${rest}s`;
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
