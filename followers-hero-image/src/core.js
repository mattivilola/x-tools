export const MAX_FOLLOWERS = 2000;
export const DEFAULT_SETTINGS = {
  title: 'You make this possible.', caption: 'A little thank you to the people who show up.',
  username: '', layout: 'spotlight', theme: 'lavender', shape: 'circle', format: 'square',
  order: 'captured', size: 1080,
};
export function username(value) {
  const result = String(value ?? '').trim().replace(/^@/, '');
  if (!/^[a-zA-Z0-9_]{1,15}$/.test(result)) throw new Error('Enter an X username (1–15 letters, numbers or underscores).');
  return result.toLowerCase();
}
export function avatarUrl(value) {
  if (typeof value === 'string' && value.length <= 128000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'pbs.twimg.com' && !url.username && !url.password && url.pathname.startsWith('/profile_images/') ? url.href : '';
  } catch { return ''; }
}
export function normalizeFollowers(items) {
  if (!Array.isArray(items) || items.length > MAX_FOLLOWERS * 2) throw new Error('Import must contain at most 4,000 follower records.');
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    let handle;
    try { handle = username(item.username); } catch { continue; }
    if (seen.has(handle)) continue;
    seen.add(handle);
    result.push({ username: handle, name: String(item.name || handle).slice(0, 80), avatar: avatarUrl(item.avatar) });
    if (result.length === MAX_FOLLOWERS) break;
  }
  return result;
}
export function settings(input = {}) {
  const output = { ...DEFAULT_SETTINGS };
  for (const key of ['title', 'caption', 'username']) if (typeof input[key] === 'string') output[key] = input[key].slice(0, key === 'username' ? 16 : 140);
  const choices = { layout: ['spotlight', 'grid', 'banner'], theme: ['lavender', 'ocean', 'paper', 'midnight'], shape: ['circle', 'rounded', 'square'], format: ['square', 'portrait', 'landscape'], order: ['captured', 'reverse'] };
  for (const [key, allowed] of Object.entries(choices)) if (allowed.includes(input[key])) output[key] = input[key];
  if ([1080, 2160].includes(Number(input.size))) output.size = Number(input.size);
  return output;
}
export function dimensions(config) {
  const size = settings(config).size;
  return config.format === 'portrait' ? [size, Math.round(size * 1.25)] : config.format === 'landscape' ? [Math.round(size * 1.5), size] : [size, size];
}
export function collectionPage(value, handle) {
  try {
    const url = new URL(value);
    return url.origin === 'https://x.com' && url.pathname.replace(/\/$/, '').toLowerCase() === `/${username(handle)}/followers`;
  } catch { return false; }
}
export function demoFollowers(count = 144) {
  const names = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Jamie'];
  return Array.from({ length: count }, (_, i) => ({ username: `demo_${i + 1}`, name: `${names[i % names.length]} ${i + 1}`, avatar: '' }));
}
