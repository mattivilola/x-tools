import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
for (const file of readdirSync(new URL('src/', root)).filter((name) => name.endsWith('.js'))) {
  execFileSync(process.execPath, ['--check', new URL(`src/${file}`, root).pathname], { stdio: 'inherit' });
}
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
if (manifest.manifest_version !== 3 || manifest.optional_host_permissions.join() !== 'https://x.com/*' || manifest.host_permissions) throw new Error('Unexpected permissions');
console.log('Followers Manager syntax and manifest checks passed.');
