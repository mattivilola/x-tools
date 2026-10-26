import { mkdtempSync, cpSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../../dist/', import.meta.url));
mkdirSync(output, { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'followers-manager-package-'));
try {
  for (const name of ['manifest.json', 'app.html', 'style.css', 'src', 'PRIVACY.md']) cpSync(join(root, name), join(stage, name), { recursive: true });
  mkdirSync(join(stage, 'assets'));
  for (const size of [16, 32, 48, 128]) copyFileSync(join(root, 'assets', `icon-${size}.png`), join(stage, 'assets', `icon-${size}.png`));
  copyFileSync(join(root, '../LICENSE'), join(stage, 'LICENSE'));
  const zip = join(output, 'followers-manager-0.1.0.zip');
  execFileSync('zip', ['-q', '-r', '-FS', zip, 'manifest.json', 'app.html', 'style.css', 'src', 'assets', 'PRIVACY.md', 'LICENSE'], { cwd: stage });
  console.log(zip);
} finally { rmSync(stage, { recursive: true, force: true }); }
