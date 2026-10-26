import test from 'node:test';
import assert from 'node:assert/strict';
import { username, avatarUrl, normalizeFollowers, settings, dimensions, collectionPage, demoFollowers, MAX_FOLLOWERS } from '../src/core.js';

test('validates handles without allowing paths or query injection', () => {
  assert.equal(username(' @Matti_Vilola '), 'matti_vilola');
  for (const value of ['', 'name/followers', 'test?x=1', 'x'.repeat(16), null]) assert.throws(() => username(value));
});
test('accepts only HTTPS profile images on the exact X image host', () => {
  const good = 'https://pbs.twimg.com/profile_images/123/avatar_normal.jpg';
  assert.equal(avatarUrl(good), good);
  for (const bad of ['http://pbs.twimg.com/profile_images/a', 'https://pbs.twimg.com.evil.test/profile_images/a', 'data:image/svg+xml;base64,PHN2Zz4=' , 'https://pbs.twimg.com/media/a', 'https://evil.test/a']) assert.equal(avatarUrl(bad), '');
});
test('imports are deduplicated, sanitized and bounded', () => {
  assert.deepEqual(normalizeFollowers([{ username: 'Alex', name: 'Alex', avatar: 'https://evil.test/a' }, { username: '@alex' }, { username: '../x' }, null]), [{ username: 'alex', name: 'Alex', avatar: '' }]);
  assert.equal(normalizeFollowers(Array.from({ length: 3000 }, (_, i) => ({ username: `person${i}` }))).length, MAX_FOLLOWERS);
  assert.throws(() => normalizeFollowers(Array(4001).fill({ username: 'a' })));
  assert.throws(() => normalizeFollowers({ followers: [] }));
});
test('settings exclude unknown values and bound text and resolution', () => {
  const config = settings({ theme: 'javascript:evil', size: 99999, title: 'a'.repeat(1000), layout: 'grid', format: 'portrait', injected: true });
  assert.equal(config.theme, 'lavender'); assert.equal(config.size, 1080);
  assert.equal(config.title.length, 140); assert.equal(config.layout, 'grid');
  assert.equal(config.injected, undefined);
  assert.deepEqual(dimensions(config), [1080, 1350]);
  assert.deepEqual(dimensions(settings({ size: 2160, format: 'landscape' })), [3240, 2160]);
});
test('collection page checks are account-specific and reject similar hosts/routes', () => {
  assert.equal(collectionPage('https://x.com/Alex/followers/', 'alex'), true);
  for (const value of ['https://x.com/other/followers', 'https://x.com/alex/followers_you_follow', 'https://x.com.evil.test/alex/followers', 'http://x.com/alex/followers', 'broken']) assert.equal(collectionPage(value, 'alex'), false);
});
test('demo never references real photos and contains unique people', () => {
  const demo = demoFollowers(); assert.equal(demo.length, 144);
  assert.equal(new Set(demo.map((p) => p.username)).size, 144);
  assert.equal(demo.every((p) => p.avatar === ''), true);
});
