import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
const exec = promisify(execFile);
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const mount = process.env.MARGIN_BASE_PATH || '';
const expectedVersion = process.argv[3] || metadata.version;
const source = process.argv[2] || new URL(`../artifacts/margin-${metadata.version}-${process.platform}-${process.arch}${process.platform === 'win32' ? '.exe' : ''}`, import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), 'margin-binary-test-'));
const executable = path.join(directory, process.platform === 'win32' ? 'margin.exe' : 'margin');
let child;
const objects = new Map();
const storage = createServer(async (req, res) => {
  const key = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'HEAD') { res.end(); return; }
  if (req.method === 'PUT') { const chunks = []; for await (const chunk of req) chunks.push(chunk); objects.set(key, Buffer.concat(chunks)); res.end(); return; }
  if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204).end(); return; }
  const object = objects.get(key); if (!object) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', 'application/octet-stream'); res.end(object);
});
try {
  await cp(source, executable);
  const emptyPath = path.join(directory, 'empty-path'); await mkdir(emptyPath);
  // Use a minimal environment: no ambient credentials, NODE_PATH, or Node binary on PATH.
  const env = { MARGIN_BASE_PATH: mount, PATH: emptyPath, HOME: directory, USERPROFILE: directory, TMPDIR: directory, TMP: directory, TEMP: directory, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) };
  const options = { cwd: directory, env, timeout: 30000, maxBuffer: 4 * 1024 * 1024 };
  const run = async args => (await exec(executable, args, options)).stdout;
  assert.equal((await run(['--version'])).trim(), expectedVersion);
  assert.match(await run(['help']), /serve/);
  assert.match(JSON.parse(await run(['help', '--json'])).help, /publish/);
  assert.equal(JSON.parse(await run(['--version', '--json'])).version, expectedVersion);
  await assert.rejects(run(['list', '--json']), error => {
    assert.equal(error.code, 1);
    assert.match(JSON.parse(error.stderr).error, /MARGIN_TOKEN/);
    return true;
  });
  assert.match(await run(['serve', '--help']), /data-dir/);
  assert.match((await run(['keygen'])).trim(), /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(await run(['skills', 'list', '--json']))[0].name, 'margin-authoring');
  const installed = JSON.parse(await run(['skills', 'install', 'margin-authoring', '--dir', 'skills', '--json']));
  assert.match(await readFile(installed.path, 'utf8'), /Margin/);
  await assert.rejects(run(['skills', 'install', 'margin-authoring', '--dir', 'skills']), /already exists/);
  await assert.rejects(run(['serve', '--port', 'invalid']), /Port must/);
  storage.listen(0, '127.0.0.1'); await once(storage, 'listening');
  const config = path.join(directory, 'blog.env');
  await writeFile(config, `MARGIN_ENV=test\nSETUP_TOKEN=binary-smoke-setup\nS3_BUCKET=binary-test\nS3_REGION=us-east-1\nS3_ENDPOINT=http://127.0.0.1:${storage.address().port}\nS3_FORCE_PATH_STYLE=true\nS3_ACCESS_KEY_ID=fixture\nS3_SECRET_ACCESS_KEY=fixture\nCONTENT_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
  async function start() {
    let output = '';
    child = spawn(executable, ['serve', '--port', '0', '--data-dir', 'saved-data', '--env-file', config], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 30000);
      const fail = error => { clearTimeout(timer); reject(error); };
      child.once('error', fail); child.once('exit', code => fail(new Error(`Server exited ${code}: ${output}`)));
      child.stderr.on('data', chunk => { output += chunk; });
      child.stdout.on('data', chunk => { output += chunk; const url = output.match(/Margin listening on (http:\/\/[^\s]+)/)?.[1]; if (url) { clearTimeout(timer); resolve(url + mount); } });
    });
  }
  async function stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; child = undefined; }
  let url = await start();
  const health = await (await fetch(`${url}/api/health`)).json(); assert.equal(health.database, 'sqlite');
  // Public HTML is rendered directly by Go; the workspace uses compiled Remix.
  const setup = await fetch(`${url}/api/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(url).origin }, body: JSON.stringify({ email: 'owner@example.test', password: 'binary-smoke-password', setupToken: 'binary-smoke-setup' }) });
  assert.equal(setup.status, 201);
  // Tokens default to reader; this smoke test also publishes and checks owner-only storage diagnostics.
  const tokenResponse = await fetch(`${url}/api/tokens`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(url).origin, Cookie: setup.headers.get('set-cookie').split(';')[0] }, body: JSON.stringify({ name: 'binary smoke', role: 'owner' }) });
  assert.equal(tokenResponse.status, 201);
  const token = await tokenResponse.json();
  assert.equal(token.role, 'owner');
  env.MARGIN_TOKEN = token.token; env.MARGIN_URL = url;
  await writeFile(path.join(directory, 'article.md'), '# Binary test\n\nWritten without Node on PATH.\n');
  const post = JSON.parse(await run(['create', '--title', 'Binary test', '--slug', 'binary-test', '--file', 'article.md', '--json']));
  assert.equal(post.status, 'draft');
  const edited = JSON.parse(await run(['update', post.id, '--lines', '1:1', '--text', '# Revised binary test', '--revision', post.revision, '--json']));
  assert.notEqual(edited.revision, post.revision);
  await assert.rejects(run(['update', post.id, '--lines', '1:1', '--text', 'Stale edit', '--revision', post.revision, '--json']), error => {
    assert.equal(error.code, 1);
    assert.equal(JSON.parse(error.stderr).code, 'REVISION_CONFLICT');
    return true;
  });
  assert.equal(JSON.parse(await run(['grep', 'without Node', '--id', post.id, '--json']))[0].line, 3);
  await assert.rejects(run(['publish', post.id, '--json']), error => {
    assert.equal(JSON.parse(error.stderr).code, 'REVISION_REQUIRED');
    return true;
  });
  assert.equal(JSON.parse(await run(['publish', post.id, '--revision', edited.revision, '--json'])).status, 'published');
  assert.equal((await fetch(`${url}/api/public/posts/binary-test`)).status, 200);
  const articleHTML = await (await fetch(`${url}/post/binary-test`)).text();
  assert.match(articleHTML, /Written without Node on PATH/);
  const asset = articleHTML.match(/src="([^"]+\.js)"/)?.[1]; assert(asset); assert.equal((await fetch(new URL(asset, url))).status, 200);
  assert(![...objects.values()].some(bytes => bytes.includes(Buffer.from('Written without Node'))));
  assert.equal(JSON.parse(await run(['info', '--json'])).storage.reachable, true);
  await stop(); url = await start(); env.MARGIN_URL = url;
  const reloaded = JSON.parse(await run(['get', post.id, '--json']));
  assert.equal(reloaded.status, 'published');
  assert.equal(JSON.parse(await run(['unpublish', post.id, '--revision', reloaded.revision, '--json'])).status, 'draft');
  await stop();
  console.log('Binary smoke test passed: no Node on PATH; CLI, agent skills, Go-rendered HTML, SQLite persistence, encrypted content, grep and publishing work.');
} finally {
  if (child) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
  if (storage.listening) await new Promise(resolve => storage.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
