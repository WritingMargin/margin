import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.env.MARGIN_PREBUILT_WEB !== '1') {
  execSync('npm ci', { cwd: root, stdio: 'inherit' });
  execSync('npm run build:web', { cwd: root, stdio: 'inherit' });
}
const web = path.join(root, 'backend/assets/web');
await readFile(path.join(root, 'dist/client/index.html'));
await readFile(path.join(root, 'dist/client/public-manifest.json'));
await mkdir(web, { recursive: true });
for (const entry of await readdir(web)) {
  if (entry !== 'README.txt') await rm(path.join(web, entry), { recursive: true, force: true });
}
await cp(path.join(root, 'dist/client'), web, { recursive: true });

const notices = ['Margin runtime dependency notices', await readFile(path.join(root, 'cli/cmd/build/go.LICENSE.txt'), 'utf8')];
const modules = execFileSync('go', ['list', '-m', '-json', 'all'], { cwd: path.join(root, 'backend'), encoding: 'utf8' });
// go list emits a sequence of top-level JSON objects, rather than a JSON array.
const dependencies = JSON.parse(`[${modules.trim().replace(/}\s*\n{/g, '},{')}]`);
for (const module of dependencies) {
  if (module.Main || module.Path === "margin-cli") continue;
  for (const filename of ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'COPYING', 'NOTICE']) {
    try {
      notices.push(`${module.Path}@${module.Version}\n${await readFile(path.join(module.Replace?.Dir || module.Dir, filename), 'utf8')}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
await mkdir(path.join(root, 'artifacts'), { recursive: true });
await writeFile(path.join(root, 'artifacts/release-notices.txt'), notices.join('\n\n'));
console.log('Prepared embedded frontend and runtime license notices.');
