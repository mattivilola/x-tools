import { normalizeHandle } from './core.js';

export const TERMINAL = new Set(['complete', 'stopped', 'error']);
export const MAX_QUEUE = 30;
export function isKept(target, keepList = []) {
  return keepList.some((item) => typeof item === 'string' ? item.toLowerCase().replace(/^@/, '') === target.username :
    (target.id && item.id === target.id) || (item.username && item.username.toLowerCase() === target.username));
}
export function makeSession(input) {
  const account = normalizeHandle(input.account);
  if (!['scan', 'cleanup', 'inspect'].includes(input.mode)) throw new Error('Unknown session mode.');
  if (input.authorization !== 'written-permission') throw new Error('Confirm the required written authorization from X for this live session.');
  if (input.mode === 'cleanup' && input.consent !== true) throw new Error('Continuous monitoring must be acknowledged.');
  const queue = (input.queue || []).map((item) => ({
    username: normalizeHandle(item.username), id: item.id ? String(item.id) : null,
    name: String(item.name || '').slice(0, 100), reasons: (item.reasons || []).map(String).map((s) => s.slice(0, 200)).slice(0, 5),
    protected: item.protected === true,
  }));
  if (input.mode !== 'scan' && (!queue.length || queue.length > MAX_QUEUE)) throw new Error(`Select between 1 and ${MAX_QUEUE} accounts per session.`);
  if (new Set(queue.map((row) => row.username)).size !== queue.length) throw new Error('Duplicate accounts in selection.');
  if (queue.some((row) => row.username === account || row.protected)) throw new Error('Your own account and protected accounts cannot be selected.');
  return { id: crypto.randomUUID(), account, mode: input.mode, direction: input.direction === 'following' ? 'following' : 'followers',
    queue, status: 'ready', index: 0, current: null, results: [], records: [], message: 'Ready. Begin from the live monitor.',
    authorization: 'written-permission', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), delayMs: 8000, tabId: null };
}
export function sessionPath(session) {
  if (session.mode === 'inspect') return `/${session.queue[session.index]?.username || session.account}`;
  return `/${session.account}/${session.mode === 'scan' ? session.direction : 'following'}`;
}
export function assertSessionUrl(session, value) {
  const url = new URL(value);
  if (url.origin !== 'https://x.com' || url.pathname.replace(/\/$/, '').toLowerCase() !== sessionPath(session).toLowerCase()) {
    throw new Error('The session page changed. Stop and start a new session.');
  }
}
