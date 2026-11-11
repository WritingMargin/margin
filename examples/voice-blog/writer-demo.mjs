import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const source = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(source, '../..');
const state = path.join(root, 'artifacts/voice-blog-writer-demo');
await mkdir(path.join(state, 'objects'), { recursive: true });
const catalog = JSON.parse(await readFile(path.join(root, 'margin-central/internal/central/templates.json'), 'utf8'));
const keyFile = path.join(state, 'encryption.secret');
let encryptionKey;
try { encryptionKey = await readFile(keyFile, 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; encryptionKey = randomBytes(32).toString('hex'); await writeFile(keyFile, encryptionKey, { mode: 0o600 }); }

// Isolated, loopback-only fixtures. Content still passes through Margin's real
// encrypted object storage, SQLite, revisions, publishing, and renderers.
const central = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(req.url.startsWith('/v1/templates') ? catalog : { entitlements: { active: false, planId: null, expiresAt: null } }));
});
const storage = createServer(async (req, res) => {
  const key = new URL(req.url, 'http://storage.test').pathname;
  const file = path.join(state, 'objects', createHash('sha256').update(key).digest('hex'));
  try {
    if (req.method === 'HEAD') { res.end(); return; }
    if (req.method === 'PUT') { const parts = []; for await (const part of req) parts.push(part); await writeFile(file, Buffer.concat(parts)); res.end(); return; }
    if (req.method === 'DELETE') { await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); res.writeHead(204).end(); return; }
    res.end(await readFile(file));
  } catch (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500).end(); }
});
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; }
const centralURL = await listen(central), storageURL = await listen(storage);
const child = spawn(path.join(root, 'artifacts/margin-server'), ['serve', '--host', '127.0.0.1', '--port', process.env.MARGIN_DEMO_PORT || '53250', '--web-dir', path.join(root, 'dist/client')], {
  cwd: state,
  env: { PATH: process.env.PATH, MARGIN_ENV: 'test', PUBLIC_URL: '', SQLITE_PATH: path.join(state, 'margin.db'), AI_SERVICE_URL: centralURL, CONTENT_ENCRYPTION_KEY: encryptionKey, S3_BUCKET: 'demo', S3_REGION: 'us-east-1', S3_ENDPOINT: storageURL, S3_FORCE_PATH_STYLE: 'true', S3_ACCESS_KEY_ID: 'demo-fixture', S3_SECRET_ACCESS_KEY: 'demo-fixture', SETUP_TOKEN: 'voice-blog-writer-demo' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stopping = false;
function stop() { if (stopping) return; stopping = true; child.kill('SIGTERM'); central.close(); storage.close(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
child.on('exit', () => { central.close(); storage.close(); });
child.stderr.on('data', data => process.stderr.write(data));
const base = await new Promise((resolve, reject) => {
  let output = '';
  child.stdout.on('data', data => { output += data; const match = /Margin listening on (http:\/\/\S+)/.exec(output); if (match) resolve(match[1]); });
  child.once('error', reject); child.once('exit', code => reject(new Error(`Demo server exited ${code}`)));
});
let cookie = '';
async function call(route, method = 'GET', value, expected = 200, authenticated = true) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Origin: base, ...(authenticated && cookie ? { Cookie: cookie } : {}) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  assert.equal(response.status, expected, `${method} ${route}: ${await response.clone().text()}`);
  return response;
}
try {
  const session = await (await call('/api/session')).json();
  const credentials = { email: 'demo@example.test', password: 'margin-local-demo-only' };
  const login = session.setupRequired
    ? await call('/api/setup', 'POST', { ...credentials, setupToken: 'voice-blog-writer-demo' }, 201)
    : await call('/api/login', 'POST', credentials);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const theme = await (await call('/api/settings')).json();
  await call('/api/settings', 'PUT', { ...theme, name: 'Audio journal · local demo', comments: { ...theme.comments, visible: false } });
  const existing = await (await call('/api/posts')).json();
  const old = existing.find(item => item.slug === 'stories-in-sound');
  const payload = { title: 'Stories sound better with a little space.', slug: 'stories-in-sound', excerpt: 'A sample audio article with compact and artwork Spotify players.', content: await readFile(path.join(source, 'article.md'), 'utf8'), status: 'draft', tags: ['Audio journal'], recommendations: { mode: 'manual', postIds: [] } };
  const draft = await (await call(old ? `/api/posts/${old.id}` : '/api/posts', old ? 'PUT' : 'POST', { ...payload, ...(old ? { revision: old.revision } : {}) }, old ? 200 : 201)).json();
  const result = { base, writer: `${base}/admin/posts/${draft.id}`, id: draft.id };
  await writeFile(path.join(state, 'results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) { stop(); throw error; }
