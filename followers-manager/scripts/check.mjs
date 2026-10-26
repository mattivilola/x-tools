import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
for (const file of readdirSync(new URL('src/', root)).filter((name) => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', new URL(`src/${file}`, root).pathname], { stdio: 'inherit' });
}
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
if (manifest.manifest_version !== 3 || manifest.optional_host_permissions.join() !== 'https://x.com/*' || manifest.host_permissions) throw new Error('Unexpected permissions');
for (const size of [16, 32, 48, 128]) {
  const path = `assets/icon-${size}.png`;
  if (manifest.icons?.[size] !== path || manifest.action.default_icon?.[size] !== path) throw new Error(`Missing ${size}px extension/action icon`);
  const png = readFileSync(new URL(path, root));
  if (png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) throw new Error(`Invalid ${size}px PNG icon`);
}
console.log('Followers Manager syntax and manifest checks passed.');
