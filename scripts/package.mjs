import { mkdirSync, readFileSync, copyFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tool = join(root, 'followers-hero-image');
const { version } = JSON.parse(readFileSync(join(tool, 'manifest.json'), 'utf8'));
const output = join(root, 'dist', `followers-hero-image-${version}.zip`);
mkdirSync(resolve(root, 'dist'), { recursive: true });
const stage = mkdtempSync(join(tmpdir(), 'followers-hero-package-'));
try {
  for (const name of ['manifest.json', 'app.html', 'style.css', 'src', 'PRIVACY.md']) cpSync(join(tool, name), join(stage, name), { recursive: true });
  copyFileSync(join(root, 'LICENSE'), join(stage, 'LICENSE'));
  // ZIP includes only runtime files and license, never collections or developer output.
  execFileSync('zip', ['-q', '-r', '-FS', output, 'manifest.json', 'app.html', 'style.css', 'src', 'PRIVACY.md', 'LICENSE'], { cwd: stage });
  console.log(output);
} finally { rmSync(stage, { recursive: true, force: true }); }
