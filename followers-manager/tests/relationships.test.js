import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRelationships, mergeRelationships, relationshipsFromSession } from '../src/relationships.js';
import { buildActionQueue } from '../src/core.js';
const before = '2026-11-03T09:00:00Z', after = '2026-11-03T10:00:00Z';
const people = Array.from({ length: 7 }, (_, i) => ({ id: String(i + 1), username: `person${i}`, verified: true, isFollowing: false, observedAt: before }));
const snapshot = { account: 'fixture', source: 'synthetic', coverage: 'complete', observedAt: before, followers: people, following: [], followerCount: 7, followingCount: 0 };

test('a completed test batch immediately excludes its confirmed targets from the next full queue without editing history', () => {
  const history = structuredClone(snapshot);
  const states = relationshipsFromSession({ account: 'fixture', mode: 'follow', queue: people.slice(0, 5), results: people.slice(0, 5).map((p) => ({ username: p.username, at: after, outcome: 'confirmed' })) });
  const view = applyRelationships(snapshot, states);
  assert.deepEqual(buildActionQueue(view, 'follow-verified').queue.map((p) => p.username), ['person5', 'person6']);
  assert.equal(view.following.length, 5); assert.equal(view.followers[0].isFollowing, true);
  assert.deepEqual(snapshot, history);
});

test('stopped sessions retain confirmed and explicitly observed states, never guessed or uncertain states', () => {
  const session = { account: 'fixture', mode: 'follow', status: 'stopped', queue: people, results: [
    { username: 'person0', at: after, outcome: 'confirmed' },
    { username: 'person1', at: after, outcome: 'skipped', detail: 'Already following.' },
    { username: 'person2', at: after, outcome: 'uncertain' },
    { username: 'person3', at: after, outcome: 'skipped', detail: 'Not found in this list window; relationship unknown.' },
  ] };
  const known = relationshipsFromSession(session);
  assert.equal(known.length, 2); assert.equal(known.every((p) => p.isFollowing), true);
  const unfollow = relationshipsFromSession({ ...session, mode: 'cleanup', results: [{ username: 'person0', at: '2026-11-03T11:00:00Z', outcome: 'confirmed' }] });
  const merged = mergeRelationships(known, unfollow);
  assert.equal(merged.find((r) => r.username === 'person0').isFollowing, false);
  assert.equal(applyRelationships(snapshot, merged).following.length, 1);
});

test('newer scan evidence wins, identities survive renames, reused handles and other owners are isolated', () => {
  const states = [{ account: 'fixture', id: '1', username: 'person0', isFollowing: true, observedAt: after, source: 'confirmed' }];
  const newer = { ...snapshot, followers: [{ ...people[0], observedAt: '2026-11-03T11:00:00Z', isFollowing: false }], followerCount: 1 };
  assert.equal(applyRelationships(newer, states).following.length, 0);
  const renamed = { ...snapshot, followers: [{ ...people[0], username: 'renamed' }], followerCount: 1 };
  assert.equal(applyRelationships(renamed, states).followers[0].isFollowing, true);
  const reused = { ...snapshot, followers: [{ ...people[0], id: '999' }], followerCount: 1 };
  assert.equal(applyRelationships(reused, states).followers[0].isFollowing, false);
  assert.equal(applyRelationships({ ...snapshot, account: 'someoneelse' }, states).following.length, 0);
  assert.equal(mergeRelationships(states, [{ ...states[0], observedAt: before, isFollowing: false }])[0].isFollowing, true);
});
