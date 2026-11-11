// Build once, then verify that the exact same binary works at different mounts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const binary = path.resolve(process.argv[2] || `artifacts/margin-${version}-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`);
const directory = await mkdtemp(path.join(tmpdir(), 'margin-runtime-path-'));
const children = [];
const storage = createServer((req, res) => res.writeHead(req.method === 'HEAD' ? 200 : 404).end());
const marker = '/__margin_runtime_base__';

async function unusedPort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function start(base, infer) {
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    PATH: directory, HOME: directory, MARGIN_ENV: 'test', PUBLIC_URL: origin + base,
    SETUP_TOKEN: 'runtime-path-test', S3_BUCKET: 'runtime-test', S3_REGION: 'us-east-1',
    S3_ENDPOINT: `http://127.0.0.1:${storage.address().port}`, S3_FORCE_PATH_STYLE: 'true',
    S3_ACCESS_KEY_ID: 'fixture', S3_SECRET_ACCESS_KEY: 'fixture', CONTENT_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  };
  if (!infer) env.MARGIN_BASE_PATH = base;
  const child = spawn(binary, ['serve', '--port', String(port), '--data-dir', path.join(directory, String(port))], {cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe']});
  children.push(child);
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Server startup timed out')), 30000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Server exited ${code}: ${output}`)); });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      output += chunk;
      if (output.includes('Margin listening on')) { clearTimeout(timer); resolve(); }
    });
  });
  return origin;
}

async function get(origin, pathname) {
  const response = await fetch(origin + pathname);
  assert.equal(response.status, 200, pathname);
  return response.text();
}

async function checkAssets(origin, base, html) {
  const paths = [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)].map(match => match[1]);
  assert(paths.length > 2, 'workspace assets missing');
  for (const pathname of new Set(paths)) {
    assert(pathname.startsWith(base + '/assets/'), pathname);
    const text = await get(origin, pathname);
    assert(!text.includes(marker), pathname);
    // CSS references must keep fonts under this same runtime mount.
    for (const match of text.matchAll(/url\(["']?([^"')]+\.woff2?)["']?\)/g)) {
      assert(match[1].startsWith(base + '/assets/'), match[1]);
      assert.equal((await fetch(origin + match[1], { method: 'HEAD' })).status, 200);
    }
  }
}

try {
  storage.listen(0, '127.0.0.1');
  await once(storage, 'listening');
  for (const [base, infer] of [['', false], ['/blog', false], ['/company/journal', true]]) {
    const origin = await start(base, infer);
    assert.equal(JSON.parse(await get(origin, base + '/api/health')).database, 'sqlite');
    const html = await get(origin, base + '/admin/posts/new');
    assert(!html.includes(marker));
    assert(html.includes(`"basename":"${base || '/'}"`));
    await checkAssets(origin, base, html);
    const home = await get(origin, base + '/');
    assert(!home.includes(`href="${base}/admin"`));
    for (const match of home.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)) {
      assert(match[1].startsWith(base + '/public-assets/'));
      assert(!(await get(origin, match[1])).includes(marker));
    }
    if (base) {
      const redirect = await fetch(origin + base + '?test=1', {redirect: 'manual'});
      assert.equal(redirect.status, 308);
      assert.equal(redirect.headers.get('location'), base + '/?test=1');
      assert.equal((await fetch(origin + '/api/health')).status, 404);
    }
    console.log(`Runtime path passed: ${origin}${base}/admin (${infer ? 'PUBLIC_URL inference' : 'explicit mount'})`);
  }
  if (process.env.MARGIN_SMOKE_KEEP === '1') {
    console.log('Keeping synthetic fixtures available for browser verification.');
    await new Promise(resolve => { process.once('SIGTERM', resolve); process.once('SIGINT', resolve); });
  }
} finally {
  await Promise.all(children.map(async child => { if (child.exitCode !== null) return; const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }));
  await new Promise(resolve => storage.close(resolve));
  await rm(directory, {recursive: true, force: true});
}
