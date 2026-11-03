import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReview,
  buildActionQueue,
  compareSnapshots,
  DEMO_SNAPSHOTS,
  exportCsv,
  normalizeHandle,
  normalizeSnapshot,
  parseImport,
} from '../src/core.js';

const account = 'testaccount';
const beforeAt = '2026-10-01T12:00:00.000Z';
const afterAt = '2026-10-10T12:00:00.000Z';

function member(id, username, extra = {}) {
  return {
    id,
    username,
    name: 'Example ' + username,
    bio: 'Synthetic test account',
    lastPostAt: null,
    observedAt: afterAt,
    protected: false,
    followersCount: null,
    followingCount: null,
    postsCount: null,
    ...extra,
  };
}

test('keep-verified-and-followers cleanup excludes unknown, stale and positive follower evidence', () => {
  const now = Date.parse(afterAt) + 1000;
  const fresh = { verified: false, followsYou: false, observedAt: afterAt };
  const input = snapshot({ coverage: 'partial', followers: [member('mutual', 'mutual'), member('rename', 'oldname')], following: [
    member('eligible', 'eligible', fresh),
    member('verified', 'verified', { ...fresh, verified: true }),
    member('unknown', 'unknown', { ...fresh, verified: null }),
    member('stale', 'stale', { ...fresh, observedAt: beforeAt }),
    member('future', 'future', { ...fresh, observedAt: '2026-10-11T00:00:00Z' }),
    member('mutual', 'mutual', fresh),
    member('rename', 'newname', fresh),
    member('direct', 'direct', { ...fresh, followsYou: true }),
    member('unknownrel', 'unknownrel', { ...fresh, followsYou: null }),
    member('kept', 'kept', fresh), member('private', 'private', { ...fresh, protected: true }),
  ] });
  const result = buildActionQueue(input, 'unfollow-unverified-nonfollowers', ['kept'], now);
  assert.deepEqual(result.queue.map((row) => row.username), ['eligible']);
  assert.equal(result.excluded, 10); assert.match(result.warning, /Unknown or stale verification/);
  const complete = snapshot({ following: [member('unknownrel', 'unknownrel', { ...fresh, followsYou: null })] });
  assert.equal(buildActionQueue(complete, 'unfollow-unverified-nonfollowers', [], now).queue.length, 1, 'complete compatible follower absence can qualify, with live reciprocity checked again');
});

function snapshot({
  accountName = account,
  observedAt = beforeAt,
  followers = [],
  following = [],
  coverage = 'complete',
  source = 'test',
} = {}) {
  return normalizeSnapshot({ account: accountName, observedAt, followers, following, coverage, source });
}

test('normalizes valid X handles and rejects invalid handles', () => {
  assert.equal(normalizeHandle(' @Mixed_Case9 '), 'mixed_case9');
  assert.throws(() => normalizeHandle('https://x.com/name'), /Handle must contain/);
  assert.throws(() => normalizeHandle('@two@signs'), /Handle must contain/);
  assert.throws(() => normalizeHandle('sixteencharacters'), /Handle must contain/);
});

test('normalizes snapshots with string IDs, canonical dates, and content-derived IDs', () => {
  const largeId = '90071992547409931234567890';
  const first = snapshot({
    followers: [member(largeId, 'ALPHA'), member('small-id', 'beta')],
    following: [member('follow-id', 'gamma')],
  });
  const reordered = snapshot({
    followers: [member('small-id', 'beta'), member(largeId, 'ALPHA')],
    following: [member('follow-id', 'gamma')],
  });
  assert.equal(first.followers[0].id, largeId);
  assert.equal(first.followers[0].username, 'alpha');
  assert.equal(first.observedAt, beforeAt);
  assert.equal(first.id, reordered.id);
  assert.equal(first.id.startsWith('snap-'), true);
});

test('rejects duplicate identities, invalid dates, unsafe numeric IDs, and unbounded fields', () => {
  assert.throws(() => snapshot({ followers: [member('same', 'first'), member('same', 'second')] }), /duplicate member identity/);
  assert.throws(() => normalizeSnapshot({ account, observedAt: 'last Tuesday' }), /ISO 8601/);
  assert.throws(() => normalizeSnapshot({ account, observedAt: null }), /ISO 8601/);
  assert.throws(() => normalizeSnapshot({ account, observedAt: '' }), /ISO 8601/);
  assert.throws(() => normalizeSnapshot({ account, observedAt: new Date(Date.now() + 6 * 60 * 1000).toISOString() }), /five minutes/);
  assert.throws(() => snapshot({ followers: [member(Number.MAX_SAFE_INTEGER + 1, 'alpha')] }), /member id/);
  assert.throws(() => snapshot({ followers: [member('long-bio', 'alpha', { bio: 'x'.repeat(4_001) })] }), /Member bio exceeds/);
  assert.throws(() => snapshot({ followers: [member('blank-handle', '   ')] }), /Handle must contain/);
  const tooMany = Array.from({ length: 10_001 }, (_, index) => member('member-' + index, 'u' + index));
  assert.throws(() => snapshot({ followers: tooMany }), /maximum of 10000/);
  assert.throws(() => normalizeSnapshot({ account, coverage: 'complete', followers: [] }), /must include both/);
});

test('parses plain arrays and official archive wrappers as partial snapshots', () => {
  const arraySnapshot = parseImport(JSON.stringify([{ id: 'array-1', username: '@ArrayUser' }]), account, 'followers', afterAt);
  assert.equal(arraySnapshot.coverage, 'partial');
  assert.equal(arraySnapshot.followers[0].username, 'arrayuser');
  assert.deepEqual(arraySnapshot.following, []);

  const wrapper = 'window.YTD.following.part0 = [{"following":{"accountId":"9007199254740993123","userLink":"https://x.com/ArchiveUser"}}];';
  const archiveSnapshot = parseImport(wrapper, account, undefined, afterAt);
  assert.equal(archiveSnapshot.source, 'x-archive');
  assert.equal(archiveSnapshot.following[0].id, '9007199254740993123');
  assert.equal(archiveSnapshot.following[0].username, 'archiveuser');
  assert.deepEqual(archiveSnapshot.followers, []);

  const idOnly = parseImport('window.YTD.follower.part0 = [{"follower":{"accountId":"123","userLink":"https://x.com/i/user/123"}}];', account, undefined, afterAt);
  assert.equal(idOnly.followers[0].id, '123');
  assert.equal(idOnly.followers[0].username, '');
});

test('never evaluates malformed JavaScript and rejects wrong archive directions and oversized input', () => {
  delete globalThis.__followersManagerImportPwned;
  const executable = 'window.YTD.follower.part0 = []; globalThis.__followersManagerImportPwned = true;';
  assert.throws(() => parseImport(executable, account, undefined, afterAt), /supported X archive wrapper/);
  assert.equal(globalThis.__followersManagerImportPwned, undefined);

  const wrapper = 'window.YTD.following.part0 = [];';
  assert.throws(() => parseImport(wrapper, account, 'followers', afterAt), /does not match/);
  assert.throws(() => parseImport(' '.repeat(8 * 1024 * 1024 + 1), account), /maximum size of 8 MB/);
});

test('accepts a full snapshot only for the requested account', () => {
  const complete = snapshot({ followers: [member('follower-id', 'follower')], following: [member('following-id', 'followed')] });
  const parsed = parseImport(JSON.stringify(complete), account);
  assert.equal(parsed.id, complete.id);
  assert.equal(parsed.coverage, 'complete');
  assert.throws(() => parseImport(JSON.stringify(complete), 'somebodyelse'), /does not match requested account/);
});

test('partial and mixed-identity snapshots never produce losses', () => {
  const oldPartial = snapshot({ followers: [member('old-id', 'olduser')], coverage: 'partial' });
  const newPartial = snapshot({ observedAt: afterAt, followers: [], coverage: 'partial' });
  const partialResult = compareSnapshots(oldPartial, newPartial);
  assert.equal(partialResult.comparable, false);
  assert.deepEqual(partialResult.lost, []);
  assert.match(partialResult.warning, /partial imports cannot establish/);

  const stable = snapshot({ followers: [member('stable-id', 'oldname')] });
  const mixed = snapshot({ observedAt: afterAt, followers: [member(null, 'oldname')] });
  const mixedResult = compareSnapshots(stable, mixed);
  assert.equal(mixedResult.comparable, false);
  assert.deepEqual(mixedResult.lost, []);
  assert.match(mixedResult.warning, /incompatible ID and handle/);
});

test('stable IDs prevent handle renames from appearing as losses or gains', () => {
  const before = snapshot({ followers: [member('stable-1', 'oldhandle')] });
  const after = snapshot({ observedAt: afterAt, followers: [member('stable-1', 'newhandle')] });
  const result = compareSnapshots(before, after);
  assert.equal(result.comparable, true);
  assert.deepEqual(result.gained, []);
  assert.deepEqual(result.lost, []);
  assert.equal(result.warning, '');
});

test('account mismatches are incomparable and handle-only comparisons carry a rename warning', () => {
  const left = snapshot({ followers: [member(null, 'oldhandle')] });
  const mismatched = snapshot({ accountName: 'otheraccount', observedAt: afterAt, followers: [] });
  const mismatchResult = compareSnapshots(left, mismatched);
  assert.equal(mismatchResult.comparable, false);
  assert.match(mismatchResult.warning, /different accounts/);

  const after = snapshot({ observedAt: afterAt, followers: [member(null, 'newhandle')] });
  const handleResult = compareSnapshots(left, after);
  assert.equal(handleResult.comparable, true);
  assert.equal(handleResult.lost.length, 1);
  assert.equal(handleResult.gained.length, 1);
  assert.match(handleResult.warning, /handle renames/);
});

test('review labels inactivity only from fresh known activity and respects stable-ID keep entries and protected accounts', () => {
  const now = Date.parse('2026-10-26T12:00:00.000Z');
  const recentCheck = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const staleCheck = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
  const oldPost = new Date(now - 120 * 24 * 60 * 60 * 1000).toISOString();
  const reviewSnapshot = snapshot({
    observedAt: recentCheck,
    followers: [],
    following: [
      member('quiet-id', 'quietuser', { observedAt: recentCheck, lastPostAt: oldPost }),
      member('stale-id', 'staleuser', { observedAt: staleCheck, lastPostAt: oldPost }),
      member('unknown-id', 'unknownuser', { observedAt: recentCheck, lastPostAt: null }),
      member('kept-id', 'newkeptname', { observedAt: recentCheck, lastPostAt: oldPost }),
      member('private-id', 'privateuser', { observedAt: recentCheck, lastPostAt: oldPost, protected: true }),
    ],
  });
  const rows = buildReview(reviewSnapshot, null, [{ id: 'kept-id', username: 'oldkeptname' }], now);
  const byUsername = new Map(rows.map((row) => [row.username, row]));
  assert.equal(byUsername.get('quietuser').kind, 'inactive');
  assert.equal(byUsername.get('staleuser').reasons.some((reason) => reason.startsWith('No public post observed')), false);
  assert.equal(byUsername.get('unknownuser').reasons.some((reason) => reason.startsWith('No public post observed')), false);
  assert.equal(byUsername.get('newkeptname').canSelect, false);
  assert.equal(byUsername.get('newkeptname').reasons.includes('On your keep list.'), true);
  assert.equal(byUsername.get('privateuser').protected, true);
  assert.equal(byUsername.get('privateuser').canSelect, false);
  assert.equal(byUsername.get('privateuser').reasons.some((reason) => reason.startsWith('No public post observed')), false);
});

test('normalization preserves evidence markers and distinguishes an uncollected bio from a known empty bio', () => {
  const legacy = snapshot({
    coverage: 'partial',
    followers: [
      { id: 'legacy-empty', username: 'legacyempty', bio: '' },
      { id: 'legacy-known', username: 'legacyknown', bio: 'A known synthetic bio' },
    ],
    following: [],
  });
  assert.equal(legacy.followers[0].bioObserved, false);
  assert.equal(legacy.followers[0].verified, null);
  assert.equal(legacy.followers[0].followsYou, null);
  assert.equal(legacy.followers[0].isFollowing, null);
  assert.equal(legacy.followers[1].bioObserved, true);

  const imported = parseImport(JSON.stringify([{
    id: 'explicit-evidence',
    username: 'EvidenceUser',
    bio: '',
    bioObserved: true,
    verified: false,
    followsYou: false,
    isFollowing: false,
  }]), account, 'followers', afterAt);
  assert.equal(imported.followers[0].username, 'evidenceuser');
  assert.equal(imported.followers[0].bioObserved, true);
  assert.equal(imported.followers[0].verified, false);
  assert.equal(imported.followers[0].followsYou, false);
  assert.equal(imported.followers[0].isFollowing, false);
  assert.throws(() => snapshot({ followers: [member('bad-bio-marker', 'badmarker', { bioObserved: null })] }), /bioObserved must be a boolean/);
  assert.throws(() => snapshot({ followers: [member('bad-verified', 'badverified', { verified: 'yes' })] }), /verified must be a boolean or null/);

  const reviewInput = snapshot({
    followers: [member('unknown-bio-id', 'unknownbio'), member('known-empty-id', 'knownempty')],
    following: [
      member('unknown-bio-id', 'unknownbio', { bio: '', bioObserved: false }),
      member('known-empty-id', 'knownempty', { bio: '', bioObserved: true }),
    ],
  });
  const rows = new Map(buildReview(reviewInput).map((row) => [row.username, row]));
  assert.equal(rows.get('unknownbio').reasons.includes('Bio not collected; scan again or inspect this profile.'), true);
  assert.equal(rows.get('unknownbio').reasons.some((reason) => reason.includes('weak profile signal')), false);
  assert.equal(rows.get('knownempty').reasons.some((reason) => reason.includes('weak profile signal')), true);
});

test('follow queues require explicit verification when requested and exclude self, kept, private, duplicate, and already-followed accounts', () => {
  const input = snapshot({
    coverage: 'partial',
    followers: [
      member('self-id', account, { verified: true, isFollowing: false }),
      member('private-id', 'privateuser', { verified: true, protected: true }),
      member('kept-id', 'renamedkeep', { verified: true }),
      member('kept-handle-id', 'keepme', { verified: true }),
      member('already-id', 'alreadyid', { verified: true, isFollowing: false }),
      member('already-handle-id', 'alreadyhandle', { verified: true, isFollowing: false }),
      member('explicit-following-id', 'alreadyexplicit', { verified: true, isFollowing: true }),
      member('verified-good-id', 'verifiedgood', { verified: true, isFollowing: false }),
      member('ordinary-good-id', 'ordinarygood', { verified: false, isFollowing: false }),
      member('unknown-verification-id', 'unknownverified', { verified: null, isFollowing: false }),
      member('id-only-follow', '', { verified: true }),
      member('duplicate-one', 'duplicateuser', { verified: false }),
      member('duplicate-two', 'duplicateuser', { verified: true }),
    ],
    following: [
      member('already-id', 'renamedalready'),
      member(null, 'alreadyhandle'),
    ],
  });
  const keepList = [{ id: 'kept-id', username: 'oldkeepname' }, '@keepme'];

  const all = buildActionQueue(input, 'follow-all', keepList);
  assert.deepEqual(all.queue.map((row) => row.username), ['verifiedgood', 'ordinarygood', 'unknownverified']);
  assert.equal(all.excluded, 10);
  assert.match(all.warning, /only observed records/);
  assert.equal(Array.isArray(all.queue[0].reasons), true);

  const verified = buildActionQueue(input, 'follow-verified', keepList);
  assert.deepEqual(verified.queue.map((row) => row.username), ['verifiedgood']);
  assert.equal(verified.excluded, 12);
  assert.match(verified.queue[0].reasons[0], /Explicit profile evidence marks this follower as verified/);
  assert.throws(() => buildActionQueue(input, 'follow-everyone'), /Unknown action queue type/);
});

test('unfollow queues protect kept, private, and self accounts, and use only fresh or complete compatible nonfollower evidence', () => {
  const freshAt = '2026-11-02T12:00:00.000Z';
  const staleAt = '2026-10-25T12:00:00.000Z';
  const now = Date.parse('2026-11-03T12:00:00.000Z');
  const complete = snapshot({
    observedAt: freshAt,
    followers: [
      member('stale-present-id', 'staleuser', { observedAt: freshAt }),
      member('unknown-present-id', 'unknownpresent', { observedAt: freshAt }),
      member('rename-id', 'oldrename', { observedAt: freshAt }),
    ],
    following: [
      member('self-id', account),
      member('private-id', 'privateuser', { protected: true }),
      member('kept-id', 'renamedkeep'),
      member('kept-handle-id', 'keepme'),
      member('fresh-false-id', 'freshfalse', { followsYou: false, observedAt: freshAt }),
      member('explicit-true-id', 'explicittrue', { followsYou: true, observedAt: staleAt }),
      member('stale-present-id', 'staleuser', { followsYou: false, observedAt: staleAt }),
      member('unknown-absent-id', 'unknownabsent', { followsYou: null, observedAt: freshAt }),
      member('unknown-present-id', 'unknownpresent', { followsYou: null, observedAt: freshAt }),
      member('rename-id', 'newrename', { followsYou: null, observedAt: freshAt }),
    ],
  });
  const keepList = [{ id: 'kept-id', username: 'oldkeep' }, 'keepme'];

  const nonfollowers = buildActionQueue(complete, 'unfollow-nonfollowers', keepList, now);
  assert.deepEqual(nonfollowers.queue.map((row) => row.username), ['freshfalse', 'unknownabsent']);
  assert.equal(nonfollowers.excluded, 8);
  assert.match(nonfollowers.queue[0].reasons[0], /Fresh profile evidence explicitly says/);
  assert.match(nonfollowers.queue[1].reasons[0], /complete follower set/);
  assert.equal(nonfollowers.warning, '');

  const all = buildActionQueue(complete, 'unfollow-all', keepList, now);
  assert.deepEqual(all.queue.map((row) => row.username), [
    'freshfalse', 'explicittrue', 'staleuser', 'unknownabsent', 'unknownpresent', 'newrename',
  ]);
  assert.equal(all.excluded, 4);

  const partial = snapshot({
    observedAt: freshAt,
    coverage: 'partial',
    followers: [],
    following: [
      member('partial-fresh-id', 'partialfresh', { followsYou: false, observedAt: freshAt }),
      member('partial-stale-id', 'partialstale', { followsYou: false, observedAt: staleAt }),
      member('partial-unknown-id', 'partialunknown', { followsYou: null, observedAt: freshAt }),
      member('partial-true-id', 'partialtrue', { followsYou: true, observedAt: staleAt }),
    ],
  });
  const partialQueue = buildActionQueue(partial, 'unfollow-nonfollowers', [], now);
  assert.deepEqual(partialQueue.queue.map((row) => row.username), ['partialfresh']);
  assert.equal(partialQueue.excluded, 3);
  assert.match(partialQueue.warning, /only observed records/);

  const mixed = snapshot({
    observedAt: freshAt,
    followers: [member(null, 'handlefollower')],
    following: [
      member('mixed-id', 'notprovable', { followsYou: null, observedAt: freshAt }),
      member('fresh-mixed-id', 'freshmixed', { followsYou: false, observedAt: freshAt }),
    ],
  });
  const mixedQueue = buildActionQueue(mixed, 'unfollow-nonfollowers', [], now);
  assert.deepEqual(mixedQueue.queue.map((row) => row.username), ['freshmixed']);
  assert.match(mixedQueue.warning, /identities are mixed or incompatible/);
});

test('review gates nonfollower labels on complete identity-compatible data and labels comparable losses cautiously', () => {
  const previous = snapshot({
    followers: [member('lost-id', 'lostuser'), member('mutual-id', 'mutualuser')],
    following: [member('lost-id', 'lostuser'), member('mutual-id', 'mutualuser')],
  });
  const current = snapshot({
    observedAt: afterAt,
    followers: [member('mutual-id', 'mutualuser')],
    following: [member('lost-id', 'lostuser'), member('mutual-id', 'mutualuser'), member('oneway-id', 'onewayuser')],
  });
  const rows = buildReview(current, previous, [], Date.parse(afterAt));
  const byUsername = new Map(rows.map((row) => [row.username, row]));
  assert.equal(byUsername.get('lostuser').kind, 'lost');
  assert.match(byUsername.get('lostuser').reasons[0], /absence alone cannot identify/);
  assert.equal(byUsername.get('onewayuser').kind, 'nonfollower');
  assert.equal(byUsername.get('mutualuser').kind, 'review');

  const partialCurrent = snapshot({ observedAt: afterAt, followers: [], following: [member('oneway-id', 'onewayuser')], coverage: 'partial' });
  const partialRows = buildReview(partialCurrent, previous, [], Date.parse(afterAt));
  assert.equal(partialRows[0].reasons.some((reason) => reason.startsWith('Does not appear among your followers')), false);
});

test('CSV exports quote cells and neutralize spreadsheet formulas', () => {
  const csv = exportCsv([{
    username: '=HYPERLINK("https://example.invalid")',
    id: '123',
    name: 'A, "quoted" name',
    bio: 'line one\nline two',
    kind: 'review',
    reasons: ['=1+1'],
    protected: false,
    canSelect: true,
  }]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
  assert.match(exportCsv([{ username: '\t=1+1' }]), /"'\t=1\+1"/);
  assert.match(csv, /"A, ""quoted"" name"/);
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /\r\n/);
});

test('synthetic demo snapshots show gains, losses, inactive and sparse review rows without real identities', () => {
  assert.equal(DEMO_SNAPSHOTS.length, 2);
  assert.equal(DEMO_SNAPSHOTS.every((entry) => entry.account === 'demoaccount' && entry.source === 'synthetic-demo'), true);
  const comparison = compareSnapshots(DEMO_SNAPSHOTS[0], DEMO_SNAPSHOTS[1]);
  assert.equal(comparison.comparable, true);
  assert.equal(comparison.gained.length, 2);
  assert.equal(comparison.lost.length, 2);
  assert.equal(DEMO_SNAPSHOTS[1].followers.find((row) => row.username === 'demoalpha').verified, true);
  assert.equal(DEMO_SNAPSHOTS[1].following.find((row) => row.username === 'demogoneone').followsYou, false);
  assert.equal(DEMO_SNAPSHOTS[1].following.find((row) => row.username === 'demosparse').bioObserved, true);
  const review = buildReview(DEMO_SNAPSHOTS[1], DEMO_SNAPSHOTS[0], [], Date.now());
  assert.equal(review.some((row) => row.kind === 'lost'), true);
  assert.equal(review.some((row) => row.kind === 'inactive'), true);
  assert.equal(review.some((row) => row.bio === '' && row.reasons.some((reason) => reason.includes('weak profile signal'))), true);
  assert.equal(review.some((row) => row.protected && row.canSelect === false), true);
});
