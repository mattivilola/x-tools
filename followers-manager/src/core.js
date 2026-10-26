const MAX_MEMBERS_PER_DIRECTION = 10_000;
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_ID_LENGTH = 256;
const MAX_SNAPSHOT_ID_LENGTH = 256;
const MAX_SOURCE_LENGTH = 120;
const MAX_NAME_LENGTH = 500;
const MAX_BIO_LENGTH = 4_000;
const MAX_REVIEW_ROWS = MAX_MEMBERS_PER_DIRECTION;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function normalizeHandle(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Handle must be a string.');
  }

  let handle = value.trim();
  if (handle.startsWith('@')) handle = handle.slice(1);
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    throw new TypeError('Handle must contain 1 to 15 letters, numbers, or underscores.');
  }
  return handle.toLowerCase();
}

function parseIsoDate(value, fieldName, { nullable = false, now = Date.now() } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    throw new TypeError(fieldName + ' must be an ISO 8601 date string' + (nullable ? ' or null.' : '.'));
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(fieldName + ' is not a valid date.');
  if (timestamp > now + MAX_FUTURE_SKEW_MS) {
    throw new RangeError(fieldName + ' cannot be more than five minutes in the future.');
  }
  return new Date(timestamp).toISOString();
}

function normalizeId(value, fieldName = 'id') {
  if (value === null || value === undefined || value === '') return null;
  let id;
  if (typeof value === 'string') {
    id = value;
  } else if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    id = String(value);
  } else {
    throw new TypeError(fieldName + ' must be a string or a safe non-negative integer.');
  }
  if (!id.trim()) return null;
  if (id.length > MAX_ID_LENGTH) throw new RangeError(fieldName + ' exceeds the maximum length.');
  return id;
}

function textField(value, fieldName, maxLength, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') throw new TypeError(fieldName + ' must be a string.');
  if (value.length > maxLength) throw new RangeError(fieldName + ' exceeds the maximum length.');
  return value;
}

function countField(value, fieldName) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(fieldName + ' must be a non-negative safe integer or null.');
  }
  return value;
}

function normalizeMember(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Each member must be an object.');
  }
  const id = normalizeId(input.id, 'member id');
  const rawUsername = input.username;
  let username = '';
  if (rawUsername !== null && rawUsername !== undefined && rawUsername !== '') {
    if (typeof rawUsername !== 'string') throw new TypeError('Member username must be a string.');
    username = normalizeHandle(rawUsername);
  }
  if (!id && !username) throw new TypeError('A member must have a stable id or a valid username.');

  let protectedValue = input.protected;
  if (protectedValue !== null && protectedValue !== undefined && typeof protectedValue !== 'boolean') {
    throw new TypeError('Member protected must be a boolean or null.');
  }
  if (protectedValue === undefined) protectedValue = null;

  const observedAt = parseIsoDate(input.observedAt, 'Member observedAt', { nullable: true, now });
  const lastPostAt = parseIsoDate(input.lastPostAt, 'Member lastPostAt', { nullable: true, now });

  return {
    id,
    username,
    name: textField(input.name, 'Member name', MAX_NAME_LENGTH),
    bio: textField(input.bio, 'Member bio', MAX_BIO_LENGTH),
    lastPostAt,
    observedAt,
    protected: protectedValue,
    followersCount: countField(input.followersCount, 'Member followersCount'),
    followingCount: countField(input.followingCount, 'Member followingCount'),
    postsCount: countField(input.postsCount, 'Member postsCount'),
  };
}

function memberIdentityKey(member) {
  return member.id !== null ? 'id:' + member.id : 'handle:' + member.username;
}

function normalizeMemberList(value, fieldName, now) {
  if (!Array.isArray(value)) throw new TypeError(fieldName + ' must be an array.');
  if (value.length > MAX_MEMBERS_PER_DIRECTION) {
    throw new RangeError(fieldName + ' exceeds the maximum of ' + MAX_MEMBERS_PER_DIRECTION + ' members.');
  }
  const members = value.map((member) => normalizeMember(member, now));
  const seen = new Set();
  for (const member of members) {
    const key = memberIdentityKey(member);
    if (seen.has(key)) throw new TypeError(fieldName + ' contains duplicate member identity ' + key + '.');
    seen.add(key);
  }
  return members;
}

function canonicalSnapshotContent(snapshot) {
  const canonicalMembers = (members) => members
    .map((member) => ({ ...member }))
    .sort((a, b) => {
      const left = memberIdentityKey(a);
      const right = memberIdentityKey(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  return JSON.stringify({
    account: snapshot.account,
    observedAt: snapshot.observedAt,
    source: snapshot.source,
    coverage: snapshot.coverage,
    followers: canonicalMembers(snapshot.followers),
    following: canonicalMembers(snapshot.following),
    followerCount: snapshot.followerCount,
    followingCount: snapshot.followingCount,
  });
}

function deterministicSnapshotId(snapshot) {
  const content = canonicalSnapshotContent(snapshot);
  // FNV-1a 64-bit gives stable synchronous IDs without browser crypto or network access.
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < content.length; index += 1) {
    const codePoint = content.codePointAt(index);
    if (codePoint > 0xffff) index += 1;
    const encoded = codePoint > 0xffff
      ? [0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)]
      : codePoint <= 0x7f
        ? [codePoint]
        : codePoint <= 0x7ff
          ? [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)]
          : [0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)];
    for (const byte of encoded) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
  }
  return 'snap-' + hash.toString(36);
}

export function normalizeSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Snapshot must be an object.');
  }
  let account;
  try {
    account = normalizeHandle(input.account);
  } catch (error) {
    throw new TypeError('Snapshot account must be a valid X handle: ' + error.message);
  }

  const now = Date.now();
  const observedAt = input.observedAt === undefined
    ? new Date(now).toISOString()
    : parseIsoDate(input.observedAt, 'Snapshot observedAt', { now });
  const coverage = input.coverage === undefined ? 'partial' : input.coverage;
  if (coverage !== 'complete' && coverage !== 'partial') {
    throw new TypeError('Snapshot coverage must be complete or partial.');
  }
  const followers = normalizeMemberList(input.followers === undefined ? [] : input.followers, 'Snapshot followers', now);
  const following = normalizeMemberList(input.following === undefined ? [] : input.following, 'Snapshot following', now);
  if (coverage === 'complete' && (input.followers === undefined || input.following === undefined)) {
    throw new TypeError('A complete snapshot must include both followers and following arrays.');
  }

  const source = textField(input.source, 'Snapshot source', MAX_SOURCE_LENGTH, 'import');
  const snapshot = {
    id: textField(input.id, 'Snapshot id', MAX_SNAPSHOT_ID_LENGTH, ''),
    account,
    observedAt,
    source,
    coverage,
    followers,
    following,
    followerCount: countField(input.followerCount, 'Snapshot followerCount'),
    followingCount: countField(input.followingCount, 'Snapshot followingCount'),
  };
  if (coverage === 'complete' && ((snapshot.followerCount !== null && snapshot.followerCount !== followers.length) || (snapshot.followingCount !== null && snapshot.followingCount !== following.length))) {
    throw new TypeError('Complete snapshot totals must match the full membership lists.');
  }
  if (!snapshot.id.trim()) snapshot.id = deterministicSnapshotId(snapshot);
  return snapshot;
}

function utf8ByteLength(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return Buffer.byteLength(value, 'utf8');
}

function archiveHandleFromLink(value) {
  if (typeof value !== 'string' || value.length > 2_048) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.hostname.toLowerCase() !== 'x.com') return '';
  const path = url.pathname.split('/').filter(Boolean);
  if (path.length !== 1) return '';
  try {
    return normalizeHandle(decodeURIComponent(path[0]));
  } catch {
    return '';
  }
}

function archiveMemberToRecord(item, direction) {
  const archiveKey = direction === 'followers' ? 'follower' : 'following';
  const record = item && typeof item === 'object' && item[archiveKey] && typeof item[archiveKey] === 'object'
    ? item[archiveKey]
    : item;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('Archive member must contain a record object.');
  }
  const username = archiveHandleFromLink(record.userLink);
  const id = normalizeId(record.accountId ?? record.id, 'archive accountId');
  if (!username && !id) throw new TypeError('Archive member must contain a stable accountId or x.com/handle link.');
  return {
    id,
    username,
    name: textField(record.name, 'Archive member name', MAX_NAME_LENGTH),
    bio: textField(record.bio, 'Archive member bio', MAX_BIO_LENGTH),
    lastPostAt: record.lastPostAt ?? null,
    observedAt: record.observedAt ?? null,
    protected: record.protected ?? null,
    followersCount: record.followersCount ?? null,
    followingCount: record.followingCount ?? null,
    postsCount: record.postsCount ?? null,
  };
}

function importArraySnapshot(records, account, direction, observedAt, source) {
  const isArchive = records.some((record) => record && typeof record === 'object' &&
    (Object.hasOwn(record, 'follower') || Object.hasOwn(record, 'following')));
  const normalizedRecords = records.map((record) => isArchive
    ? archiveMemberToRecord(record, direction)
    : record);
  return normalizeSnapshot({
    account,
    observedAt,
    source: source || (isArchive ? 'x-archive' : 'json-array'),
    coverage: 'partial',
    followers: direction === 'followers' ? normalizedRecords : [],
    following: direction === 'following' ? normalizedRecords : [],
  });
}

export function parseImport(text, account, direction = 'followers', observedAt = new Date().toISOString()) {
  if (typeof text !== 'string') throw new TypeError('Import must be text.');
  if (text.length > MAX_INPUT_BYTES || utf8ByteLength(text) > MAX_INPUT_BYTES) {
    throw new RangeError('Import exceeds the maximum size of 8 MB.');
  }
  if (direction !== 'followers' && direction !== 'following') {
    throw new TypeError('Direction must be followers or following.');
  }
  const normalizedAccount = normalizeHandle(account);
  let parsed;
  let wrapperDirection = null;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (jsonError) {
    const wrapperMatch = text.match(/^\uFEFF?\s*window\.YTD\.(follower|following)\.part0\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
    if (!wrapperMatch) {
      throw new TypeError('Import must be a JSON snapshot, a JSON array, or a supported X archive wrapper.');
    }
    wrapperDirection = wrapperMatch[1] === 'follower' ? 'followers' : 'following';
    try {
      parsed = JSON.parse(wrapperMatch[2]);
    } catch {
      throw new TypeError('X archive wrapper contains invalid JSON.');
    }
  }

  if (wrapperDirection) {
    if (arguments.length >= 3 && arguments[2] !== undefined && direction !== wrapperDirection) {
      throw new TypeError('Archive wrapper direction does not match the requested direction.');
    }
    direction = wrapperDirection;
  }
  if (Array.isArray(parsed)) {
    if (parsed.length > MAX_MEMBERS_PER_DIRECTION) {
      throw new RangeError('Import exceeds the maximum of ' + MAX_MEMBERS_PER_DIRECTION + ' members.');
    }
    return importArraySnapshot(parsed, normalizedAccount, direction, observedAt, wrapperDirection ? 'x-archive' : '');
  }
  if (!parsed || typeof parsed !== 'object') throw new TypeError('Import must contain a snapshot object or a member array.');
  const snapshot = normalizeSnapshot(parsed);
  if (snapshot.account !== normalizedAccount) {
    throw new TypeError('Snapshot account ' + snapshot.account + ' does not match requested account ' + normalizedAccount + '.');
  }
  return snapshot;
}

function identityMode(records) {
  if (records.length === 0) return 'empty';
  const withId = records.reduce((total, record) => total + (record.id === null ? 0 : 1), 0);
  if (withId === records.length) return 'id';
  if (withId === 0) return 'handle';
  return 'mixed';
}

function resolveIdentityMode(left, right) {
  const leftMode = identityMode(left);
  const rightMode = identityMode(right);
  if (leftMode === 'mixed' || rightMode === 'mixed') return null;
  if (leftMode === 'empty' && rightMode === 'empty') return 'id';
  if (leftMode === 'empty') return rightMode;
  if (rightMode === 'empty') return leftMode;
  return leftMode === rightMode ? leftMode : null;
}

function keyForMode(record, mode) {
  return mode === 'id' ? 'id:' + record.id : 'handle:' + record.username;
}

function incomparable(warning) {
  return { gained: [], lost: [], comparable: false, warning };
}

export function compareSnapshots(beforeInput, afterInput) {
  let before;
  let after;
  try {
    before = normalizeSnapshot(beforeInput);
    after = normalizeSnapshot(afterInput);
  } catch (error) {
    return incomparable('Snapshots could not be compared: ' + error.message);
  }
  if (before.account !== after.account) {
    return incomparable('Snapshots belong to different accounts.');
  }
  if (before.coverage !== 'complete' || after.coverage !== 'complete') {
    return incomparable('Both snapshots must have complete coverage; partial imports cannot establish gains or losses.');
  }
  const mode = resolveIdentityMode(before.followers, after.followers);
  if (!mode) {
    return incomparable('Snapshot follower identities use mixed or incompatible ID and handle formats.');
  }
  const beforeMap = new Map(before.followers.map((record) => [keyForMode(record, mode), record]));
  const afterMap = new Map(after.followers.map((record) => [keyForMode(record, mode), record]));
  const lost = [...beforeMap.entries()]
    .filter(([key]) => !afterMap.has(key))
    .map(([, record]) => record);
  const gained = [...afterMap.entries()]
    .filter(([key]) => !beforeMap.has(key))
    .map(([, record]) => record);
  return {
    gained,
    lost,
    comparable: true,
    warning: mode === 'handle'
      ? 'Handle-based comparison is approximate; handle renames can appear as losses and gains.'
      : '',
  };
}

function normalizeKeepList(keepList) {
  if (!Array.isArray(keepList)) throw new TypeError('Keep list must be an array.');
  const entries = [];
  for (const item of keepList) {
    if (typeof item === 'string') {
      entries.push({ id: null, username: normalizeHandle(item) });
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('Keep-list entries must be handles or objects.');
    }
    const id = normalizeId(item.id, 'keep-list id');
    const username = item.username === null || item.username === undefined || item.username === ''
      ? ''
      : normalizeHandle(item.username);
    if (!id && !username) throw new TypeError('Keep-list entries need an id or username.');
    entries.push({ id, username });
  }
  return entries;
}

function isKept(record, keepList) {
  return keepList.some((entry) => {
    if (entry.id !== null && record.id !== null) return entry.id === record.id;
    return entry.username !== '' && record.username !== '' && entry.username === record.username;
  });
}

function recordDateMs(value) {
  return value === null ? null : Date.parse(value);
}

export function buildReview(snapshotInput, previousInput = null, keepList = [], now = Date.now()) {
  const snapshot = normalizeSnapshot(snapshotInput);
  if (!Number.isFinite(now)) throw new TypeError('now must be a timestamp in milliseconds.');
  const keepEntries = normalizeKeepList(keepList);
  let previous = null;
  if (previousInput) previous = normalizeSnapshot(previousInput);

  let lostByKey = new Map();
  let lostMode = null;
  let previousComparison = null;
  if (previous) {
    previousComparison = compareSnapshots(previous, snapshot);
    if (previousComparison.comparable) {
      lostMode = resolveIdentityMode(previous.followers, snapshot.followers);
      lostByKey = new Map(previousComparison.lost.map((record) => [keyForMode(record, lostMode), record]));
    }
  }

  let relationshipMode = null;
  if (snapshot.coverage === 'complete') {
    relationshipMode = resolveIdentityMode(snapshot.followers, snapshot.following);
  }
  const followerKeys = relationshipMode
    ? new Set(snapshot.followers.map((record) => keyForMode(record, relationshipMode)))
    : new Set();
  const followingModeForLost = lostMode
    ? resolveIdentityMode(snapshot.following, snapshot.followers)
    : null;

  return snapshot.following
    .filter((record) => record.username !== '')
    .map((record) => {
      const reasons = [];
      let lost = false;
      if (lostByKey.size > 0 && followingModeForLost === lostMode) {
        lost = lostByKey.has(keyForMode(record, lostMode));
      }
      if (lost) {
        reasons.push('No longer observed among your followers in comparable complete snapshots; absence alone cannot identify an unfollow, block, deletion, or suspension.');
      }

      const currentIdentityMode = relationshipMode;
      const memberMode = identityMode([record]);
      const canCheckReciprocity = snapshot.coverage === 'complete' && currentIdentityMode !== null &&
        currentIdentityMode !== 'mixed' && memberMode === currentIdentityMode;
      if (canCheckReciprocity && !followerKeys.has(keyForMode(record, currentIdentityMode))) {
        reasons.push('Does not appear among your followers in this complete snapshot; this says nothing about account quality.');
      }

      const observedMs = recordDateMs(record.observedAt);
      const lastPostMs = recordDateMs(record.lastPostAt);
      const evidenceIsFresh = observedMs !== null && observedMs <= now && now - observedMs <= 7 * DAY_MS;
      if (record.protected !== true && evidenceIsFresh && lastPostMs !== null && lastPostMs <= observedMs && now - lastPostMs >= 90 * DAY_MS) {
        reasons.push('No public post observed for at least 90 days; activity evidence was checked within the last seven days. This does not show whether the account is still useful.');
      }
      if (record.bio.trim() === '') {
        reasons.push('No bio is available; this is a weak profile signal and does not identify a bot.');
      }

      const kept = isKept(record, keepEntries);
      if (kept) reasons.push('On your keep list.');
      if (record.protected === true) reasons.push('Protected account; excluded from selection by default.');

      let kind = 'review';
      if (lost) kind = 'lost';
      else if (reasons.some((reason) => reason.startsWith('No public post observed'))) kind = 'inactive';
      else if (reasons.some((reason) => reason.startsWith('Does not appear among your followers'))) kind = 'nonfollower';

      return {
        ...record,
        reasons,
        kind,
        protected: record.protected === true,
        canSelect: !kept && record.protected !== true,
      };
    });
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function exportCsv(rows) {
  if (!Array.isArray(rows)) throw new TypeError('CSV rows must be an array.');
  if (rows.length > MAX_REVIEW_ROWS) throw new RangeError('CSV export exceeds the maximum row count.');
  const columns = ['username', 'id', 'name', 'bio', 'kind', 'reasons', 'protected', 'canSelect'];
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new TypeError('Each CSV row must be an object.');
    lines.push(columns.map((column) => csvCell(column === 'reasons' && Array.isArray(row[column])
      ? row[column].join('; ')
      : row[column])).join(','));
  }
  return lines.join('\r\n');
}

const demoNow = Date.now();
const demoObservedAt = new Date(demoNow - 60 * 1000).toISOString();
const demoEarlierAt = new Date(demoNow - 5 * DAY_MS).toISOString();
const demoOldPostAt = new Date(demoNow - 180 * DAY_MS).toISOString();
const demoPreviousPostAt = new Date(demoNow - 7 * DAY_MS).toISOString();
const demoRecentPostAt = new Date(demoNow - 2 * DAY_MS).toISOString();

export const DEMO_SNAPSHOTS = Object.freeze([
  normalizeSnapshot({
    account: 'demoaccount',
    observedAt: demoEarlierAt,
    source: 'synthetic-demo',
    coverage: 'complete',
    followerCount: 4,
    followingCount: 4,
    followers: [
      { id: 'demo-follower-1001', username: 'demoalpha', name: 'Alex Example', bio: 'Synthetic demo profile', observedAt: demoEarlierAt, lastPostAt: demoPreviousPostAt, protected: false },
      { id: 'demo-follower-1002', username: 'demobeta', name: 'Blair Example', bio: 'Synthetic demo profile', observedAt: demoEarlierAt, lastPostAt: demoPreviousPostAt, protected: false },
      { id: 'demo-follower-1003', username: 'demogoneone', name: 'Casey Example', bio: 'Synthetic demo profile', observedAt: demoEarlierAt, lastPostAt: demoPreviousPostAt, protected: false },
      { id: 'demo-follower-1004', username: 'demogonetwo', name: 'Devon Example', bio: 'Synthetic demo profile', observedAt: demoEarlierAt, lastPostAt: demoPreviousPostAt, protected: false },
    ],
    following: [
      { id: 'demo-follower-1003', username: 'demogoneone', name: 'Casey Example', bio: 'Synthetic demo profile', observedAt: demoEarlierAt, lastPostAt: demoPreviousPostAt, protected: false },
      { id: 'demo-following-2001', username: 'demomutual', name: 'Emery Example', bio: 'Synthetic demo profile', observedAt: demoEarlierAt, lastPostAt: demoPreviousPostAt, protected: false },
      { id: 'demo-following-2002', username: 'demoquiet', name: 'Finley Example', bio: 'Synthetic demo profile', observedAt: demoEarlierAt, lastPostAt: demoOldPostAt, protected: false },
      { id: 'demo-following-2003', username: 'demosparse', name: 'Gray Example', bio: '', observedAt: demoEarlierAt, lastPostAt: demoPreviousPostAt, protected: false },
    ],
  }),
  normalizeSnapshot({
    account: 'demoaccount',
    observedAt: demoObservedAt,
    source: 'synthetic-demo',
    coverage: 'complete',
    followerCount: 4,
    followingCount: 5,
    followers: [
      { id: 'demo-follower-1001', username: 'demoalpha', name: 'Alex Example', bio: 'Synthetic demo profile', observedAt: demoObservedAt, lastPostAt: demoRecentPostAt, protected: false },
      { id: 'demo-follower-1002', username: 'demobeta', name: 'Blair Example', bio: 'Synthetic demo profile', observedAt: demoObservedAt, lastPostAt: demoRecentPostAt, protected: false },
      { id: 'demo-follower-1005', username: 'demogamma', name: 'Harper Example', bio: 'Synthetic demo profile', observedAt: demoObservedAt, lastPostAt: demoRecentPostAt, protected: false },
      { id: 'demo-follower-1006', username: 'demodelta', name: 'Indigo Example', bio: 'Synthetic demo profile', observedAt: demoObservedAt, lastPostAt: demoRecentPostAt, protected: false },
    ],
    following: [
      { id: 'demo-follower-1003', username: 'demogoneone', name: 'Casey Example', bio: 'Synthetic demo profile', observedAt: demoObservedAt, lastPostAt: demoRecentPostAt, protected: false },
      { id: 'demo-following-2001', username: 'demomutual', name: 'Emery Example', bio: 'Synthetic demo profile', observedAt: demoObservedAt, lastPostAt: demoRecentPostAt, protected: false },
      { id: 'demo-following-2002', username: 'demoquiet', name: 'Finley Example', bio: 'Synthetic demo profile', observedAt: demoObservedAt, lastPostAt: demoOldPostAt, protected: false },
      { id: 'demo-following-2003', username: 'demosparse', name: 'Gray Example', bio: '', observedAt: demoObservedAt, lastPostAt: demoRecentPostAt, protected: false },
      { id: 'demo-following-2004', username: 'demoprotected', name: 'Jules Example', bio: 'Synthetic protected demo profile', observedAt: demoObservedAt, lastPostAt: demoRecentPostAt, protected: true },
    ],
  }),
]);
