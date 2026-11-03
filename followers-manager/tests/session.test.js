import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSession, isKept, sessionPath, assertSessionUrl, MAX_QUEUE } from '../src/session.js';
import { normalizeSnapshot, buildReview } from '../src/core.js';
const input = { mode: 'cleanup', account: 'fixture', authorization: 'written-permission', consent: true, queue: [{ username: 'alice', id: '101' }] };
test('a claimed complete snapshot cannot disagree with its reported totals', () => {
  assert.throws(() => normalizeSnapshot({ account: 'fixture', coverage: 'complete', followers: [], following: [], followerCount: 20 }), /totals must match/);
});
test('the review table uses fresh direct reciprocity evidence without inventing partial-list absence', () => {
  const observedAt = new Date().toISOString();
  const snapshot = {account:'fixture',coverage:'partial',followers:[],following:[
    {username:'alice',followsYou:true,observedAt}, {username:'bruno',followsYou:false,observedAt}, {username:'unknown',observedAt}
  ]};
  const review = buildReview(snapshot);
  assert.equal(review.find(r=>r.username==='bruno').kind, 'nonfollower');
  assert.equal(review.filter(r=>r.kind==='nonfollower').length, 1);
});
test('live sessions require authorization and cleanup monitoring consent', () => {
  assert.throws(() => makeSession({ ...input, authorization: null }), /authorization/);
  assert.throws(() => makeSession({ ...input, consent: false }), /monitoring/);
  assert.equal(makeSession(input).status, 'ready');
});
test('selection is finite, unique and excludes protected and own accounts', () => {
  assert.throws(() => makeSession({ ...input, queue: [] }), /Select/);
  assert.throws(() => makeSession({ ...input, queue: Array.from({ length: MAX_QUEUE + 1 }, (_, i) => ({ username: `user${i}` })) }), /Select/);
  assert.throws(() => makeSession({ ...input, queue: [{ username: 'alice' }, { username: 'ALICE' }] }), /Duplicate/);
  assert.throws(() => makeSession({ ...input, queue: [{ username: 'fixture' }] }), /own account/);
  assert.throws(() => makeSession({ ...input, queue: [{ username: 'alice', protected: true }] }), /protected/);
});
test('bulk follow sessions use the follower route and require an explicit supported action', () => {
  assert.throws(() => makeSession({ ...input, mode: 'follow' }), /follow-back action/);
  assert.throws(() => makeSession({ ...input, mode: 'follow', action: 'unfollow-all' }), /follow-back action/);
  const s = makeSession({ ...input, mode: 'follow', action: 'follow-verified' });
  assert.equal(sessionPath(s), '/fixture/followers'); assert.equal(s.queue[0].requireVerified, true);
  assert.equal(s.pauseOnFocusLoss, true);
  assert.equal(makeSession({ ...input, pauseOnFocusLoss: false }).pauseOnFocusLoss, false);
  assert.equal(makeSession({ ...input, queue: Array.from({length: 31}, (_, i) => ({username:`user${i}`})) }).queue.length, 31);
});
test('keep checks preserve stable identities and handle protections', () => {
  assert.equal(isKept({ id: '101', username: 'renamed' }, [{ id: '101', username: 'alice' }]), true);
  assert.equal(isKept({ id: null, username: 'alice' }, ['@ALICE']), true);
  assert.equal(isKept({ id: '102', username: 'bruno' }, [{ id: '101', username: 'alice' }]), false);
});
test('a session is bound to its exact X route and origin', () => {
  const session = makeSession(input);
  assert.equal(sessionPath(session), '/fixture/following');
  assert.doesNotThrow(() => assertSessionUrl(session, 'https://x.com/fixture/following'));
  for (const url of ['https://x.com/alice/following', 'https://x.com.evil.test/fixture/following', 'https://x.com/fixture', 'http://x.com/fixture/following']) assert.throws(() => assertSessionUrl(session, url), /page changed/);
});
