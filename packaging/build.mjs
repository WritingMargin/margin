import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const target = `${process.platform}-${process.arch}`;
const output = path.join(root, 'artifacts', `margin-${version}-${target}${process.platform === 'win32' ? '.exe' : ''}`);
const temporary = await mkdtemp(path.join(tmpdir(), 'margin-go-build-'));
const run = (program, args, cwd) => execFileSync(program, args, { cwd, stdio: 'inherit' });
try {
  await readFile(path.join(root, 'dist/client/index.html'));
  const stage = path.join(temporary, 'backend');
  await cp(path.join(root, 'backend'), stage, { recursive: true });
  await rm(path.join(stage, 'assets/web'), { recursive: true, force: true });
  await cp(path.join(root, 'dist/client'), path.join(stage, 'assets/web'), { recursive: true });
  await cp(path.join(root, 'cli'), path.join(temporary, 'cli'), { recursive: true, filter: source => path.basename(source) !== 'dist' });
  const binary = path.join(temporary, process.platform === 'win32' ? 'margin.exe' : 'margin');
  run('go', ['build', '-trimpath', '-ldflags', `-s -w -X main.version=${version}`, '-o', binary, './cmd/margin-server'], stage);
  run(binary, ['--version'], temporary);
  await mkdir(path.dirname(output), { recursive: true });
  await cp(binary, output);
  const digest = createHash('sha256').update(await readFile(output)).digest('hex');
  await writeFile(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`);
  const modules = execFileSync('go', ['list', '-m', '-f', '{{.Path}} {{.Version}} {{.Dir}}', 'all'], { cwd: stage, encoding: 'utf8' });
  const notices = await collectLicenses(modules);
  await writeFile(`${output}.LICENSES.txt`, notices);
  await writeFile(`${output}.manifest.json`, JSON.stringify({ version, target, runtime: 'go', database: 'sqlite', modules }, null, 2));
  console.log(`Built ${output}\nIncludes the Go server, SQLite, crawlable public pages, compiled Remix frontend, and Go CLI. No Node runtime is required.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function collectLicenses(modules) {
  const notices = ['Margin Go runtime dependency notices'];
  notices.push(await readFile(path.join(root, 'cli/cmd/build/go.LICENSE.txt'), 'utf8'));
  for (const line of modules.trim().split('\n').slice(1)) {
    const [name, version, ...parts] = line.split(' ');
    const directory = parts.join(' ');
    for (const filename of ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'COPYING', 'NOTICE']) {
      try { notices.push(`${name}@${version}\n${await readFile(path.join(directory, filename), 'utf8')}`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  return notices.join('\n\n');
}
