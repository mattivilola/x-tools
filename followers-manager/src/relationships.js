import { normalizeHandle } from './core.js';

const same = (a, b) => a.id && b.id ? a.id === b.id : a.username === b.username;
function indexRecords(records) {
  const ids = new Map(), handles = new Map();
  for (const row of records) {
    if (row.id) ids.set(row.id, row);
    const list = handles.get(row.username) || []; list.push(row); handles.set(row.username, list);
  }
  return (target) => ids.get(target.id) || (handles.get(target.username) || []).filter((r) => same(r, target))
    .sort((a, b) => Date.parse(b.observedAt || 0) - Date.parse(a.observedAt || 0))[0];
}
export function normalizeRelationships(input = []) {
  if (!Array.isArray(input) || input.length > 100000) throw new Error('Unsupported relationship status data.');
  return input.map((r) => {
    if (typeof r.isFollowing !== 'boolean' || !Number.isFinite(Date.parse(r.observedAt))) throw new Error('Invalid relationship observation.');
    return { account: normalizeHandle(r.account), username: normalizeHandle(r.username), id: r.id ? String(r.id).slice(0, 100) : null,
      name: String(r.name || '').slice(0, 100), isFollowing: r.isFollowing, observedAt: new Date(r.observedAt).toISOString(),
      source: r.source === 'confirmed' ? 'confirmed' : 'observed' };
  });
}
export function mergeRelationships(current = [], incoming = []) {
  const merged = normalizeRelationships(current);
  for (const row of normalizeRelationships(incoming)) {
    const index = merged.findIndex((r) => r.account === row.account && same(r, row));
    if (index < 0) merged.push(row);
    else if (Date.parse(row.observedAt) >= Date.parse(merged[index].observedAt)) merged[index] = { ...row, id: row.id || merged[index].id };
  }
  return merged;
}

export function relationshipsFromSession(session) {
  if (!session || !['follow', 'cleanup'].includes(session.mode)) return [];
  const targets = new Map(session.queue.map((r) => [r.username, r]));
  return (session.results || []).flatMap((result) => {
    const target = targets.get(result.username);
    if (!target) return [];
    const confirmed = result.outcome === 'confirmed';
    const following = result.outcome === 'skipped' && result.detail === 'Already following.';
    const notFollowing = result.outcome === 'skipped' && result.detail === 'Already not following.';
    if (!confirmed && !following && !notFollowing) return [];
    return [{ account: session.account, username: target.username, id: target.id, name: target.name,
      isFollowing: confirmed ? session.mode === 'follow' : following, observedAt: result.at, source: confirmed ? 'confirmed' : 'observed' }];
  });
}

// A current working view only. Historical snapshots and chart counts are untouched.
export function applyRelationships(snapshot, states = []) {
  if (!snapshot) return snapshot;
  const relevant = states.filter((r) => r.account === snapshot.account);
  const latestFor = indexRecords(relevant), profileFor = indexRecords(snapshot.followers);
  const applicable = (row, state, inFollowing = false) => state &&
    (!(typeof row.isFollowing === 'boolean' || inFollowing) || Date.parse(state.observedAt) >= Date.parse(row.observedAt || snapshot.observedAt));
  const followers = snapshot.followers.map((r) => { const state = latestFor(r); return applicable(r, state) ? { ...r, isFollowing: state.isFollowing } : r; });
  const following = snapshot.following.filter((r) => { const state = latestFor(r); return !applicable(r, state, true) || state.isFollowing; })
    .map((r) => ({ ...r, isFollowing: true }));
  const followingFor = indexRecords(following);
  for (const state of relevant) {
    if (!state.isFollowing || followingFor(state)) continue;
    const profile = profileFor(state);
    if (profile && !applicable(profile, state)) continue;
    if (!profile && Date.parse(state.observedAt) < Date.parse(snapshot.observedAt)) continue;
    following.push({ ...(profile || state), isFollowing: true });
  }
  return { ...snapshot, followers, following, followingCount: snapshot.followingCount === null ? null : following.length };
}
