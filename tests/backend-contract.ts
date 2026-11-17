import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultTheme } from '../shared/types.ts';

const root = process.cwd();
const binary = path.join(root, 'artifacts', process.platform === 'win32' ? 'margin-server.exe' : 'margin-server');
const directory = await mkdtemp(path.join(tmpdir(), 'margin-contract-'));
const objects = new Map<string, Buffer>();
const central = createServer((_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ entitlements: { active: false, planId: null, expiresAt: null } }));
});
const s3 = createServer(async (req, res) => {
  const key = new URL(req.url!, 'http://s3.test').pathname;
  if (req.method === 'HEAD') { res.end(); return; }
  if (req.method === 'PUT') { const chunks = []; for await (const chunk of req) chunks.push(chunk); objects.set(key, Buffer.concat(chunks)); res.end(); return; }
  if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204).end(); return; }
  const bytes = objects.get(key); if (!bytes) { res.writeHead(404).end(); return; }
  res.end(bytes);
});
const close = (server: Server) => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
async function startServer(server: Server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); const address = server.address(); assert(address && typeof address !== 'string'); return `http://127.0.0.1:${address.port}`; }
let child: ReturnType<typeof spawn> | undefined;
let assertions = 0;

async function launchGo(env: NodeJS.ProcessEnv) {
  child = spawn(binary, ['serve', '--host', '127.0.0.1', '--port', '0'], { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Go startup timed out: ${output}`)), 30000);
    child!.once('error', error => { clearTimeout(timer); reject(error); });
    child!.once('exit', code => { clearTimeout(timer); reject(new Error(`Go exited ${code}: ${output}`)); });
    child!.stderr!.on('data', data => { output += data; });
    child!.stdout!.on('data', data => { output += data; const address = /Margin listening on (http:\/\/\S+)/.exec(output)?.[1]; if (address) { clearTimeout(timer); resolve(address); } });
  });
}
async function stopGo() { if (!child) return; if (child.exitCode !== null || child.signalCode !== null) { child = undefined; return; } const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; child = undefined; }
function client(base: string, savedCookie = '') {
  let cookie = savedCookie;
  const call = async (route: string, method = 'GET', value?: unknown, status = 200, headers: Record<string, string> = {}) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(method !== 'GET' ? { Origin: base } : {}), ...headers }, signal: AbortSignal.timeout(15000), ...(value !== undefined ? { body: JSON.stringify(value) } : {}) });
    assert.equal(response.status, status, `${method} ${route}: ${await response.clone().text()}`); assertions++;
    return response;
  };
  return { call, cookie: () => cookie, setCookie: (value: string) => { cookie = value; } };
}
async function contract(base: string) {
  const api = client(base);
  assert.equal((await (await api.call('/api/session')).json()).setupRequired, true);
  await api.call('/api/posts', 'GET', undefined, 401);
  const setup = await api.call('/api/setup', 'POST', { email: 'owner@example.com', password: 'correct horse battery', setupToken: 'contract-bootstrap' }, 201);
  api.setCookie(setup.headers.get('set-cookie')!.split(';')[0]);
  await api.call('/api/setup', 'POST', {}, 409);
  assert.deepEqual(await (await api.call('/api/settings')).json(), defaultTheme);
  await api.call('/api/settings', 'PUT', defaultTheme, 403, { Origin: 'https://evil.test' });
  await api.call('/api/settings', 'PUT', { ...defaultTheme, unknown: true }, 400);
  const design = { ...defaultTheme, name: 'Contract publication', homepage: { ...defaultTheme.homepage, layout: 'grid' } };
  assert.deepEqual(await (await api.call('/api/settings', 'PUT', design)).json(), design);
  const draft = await (await api.call('/api/posts', 'POST', { title: 'Unicode 日本語 🪴', slug: 'contract-post', content: '# Hello\n\nPrivate until published.' }, 201)).json();
  const route = `/api/posts/${draft.id}`;
  await api.call('/api/public/posts/contract-post', 'GET', undefined, 404);
  assert.deepEqual(await (await api.call('/api/public/posts')).json(), []);
  await api.call(route, 'PUT', { content: 'unsafe' }, 428);
  await api.call(route, 'PUT', { revision: 'old', content: 'unsafe' }, 409);
  const published = await (await api.call(route, 'PUT', { revision: draft.revision, status: 'published' })).json();
  assert.equal((await (await api.call('/api/public/posts/contract-post')).json()).content, draft.content);
  const concurrent = await Promise.all(['# Revision A', '# Revision B'].map(content => fetch(base + route, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: api.cookie() }, body: JSON.stringify({ revision: published.revision, content }) })));
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]); assertions++;
  const winner = await concurrent.find(r => r.status === 200)!.json();
  assert.equal((await (await api.call(route)).json()).content, winner.content);
  assert.match(await (await api.call('/rss.xml')).text(), /<content:encoded>/);
  await api.call('/api/posts', 'POST', { title: 'Duplicate', slug: 'contract-post', content: 'orphan' }, 409);
  await api.call('/api/ai/summaries', 'POST', { postId: draft.id, title: 'Title', content: 'Text', platforms: ['x', 'x'], tone: 'natural' }, 400);
  assert.deepEqual(await (await api.call('/api/media')).json(), { configured: false, resources: [] });
  assert.equal((await (await api.call('/api/newsletter/settings')).json()).enabled, false);
  await api.call('/api/newsletter/settings', 'PUT', { enabled: true, delivery: 'managed', senderEmail: '' }, 402);
  const anonymousComment = await api.call(`/api/public/posts/${draft.id}/comments`, 'POST', { name: 'Reader', email: 'reader@example.com', body: 'Comment', captchaToken: 'invalid' }, 401);
  assert.equal((await anonymousComment.json()).code, 'COMMENT_SIGN_IN_REQUIRED');
  const turnstile = await (await api.call('/api/settings/turnstile', 'PUT', { siteKey: 'fixture-site', secretKey: 'fixture-secret' })).json();
  assert.equal(turnstile.secretConfigured, true); assert.equal(turnstile.secretKey, undefined);
  const token = (await (await api.call('/api/tokens', 'POST', { name: 'contract' }, 201)).json()).token;
  await api.call('/api/logout', 'POST', {}); api.setCookie('');
  await api.call('/api/posts', 'GET', undefined, 401);
  await api.call('/api/posts', 'GET', undefined, 200, { Authorization: `Bearer ${token}` });
  const login = await api.call('/api/login', 'POST', { email: 'owner@example.com', password: 'correct horse battery' });
  api.setCookie(login.headers.get('set-cookie')!.split(';')[0]);
  return { token, cookie: api.cookie(), post: winner, design };
}
async function checkPersisted(base: string, saved: Awaited<ReturnType<typeof contract>>) {
  const api = client(base, saved.cookie);
  assert.equal((await (await api.call('/api/session')).json()).authenticated, true);
  assert.deepEqual(await (await api.call('/api/posts/' + saved.post.id)).json(), saved.post);
  assert.deepEqual(await (await api.call('/api/settings')).json(), saved.design);
  assert.equal((await (await api.call('/api/settings/turnstile')).json()).siteKey, 'fixture-site');
  await api.call('/api/posts', 'GET', undefined, 200, { Authorization: `Bearer ${saved.token}` });
  const login = await api.call('/api/login', 'POST', { email: 'owner@example.com', password: 'correct horse battery' });
  assert(login.headers.get('set-cookie'));
}
try {
  const centralURL = await startServer(central); const s3URL = await startServer(s3);
  const config = { MARGIN_ENV: 'test', PUBLIC_URL: '', DATABASE_URL: '', SQLITE_PATH: path.join(directory, 'margin.db'), AI_SERVICE_URL: centralURL, AI_SERVICE_TOKEN: 'fixture', CONTENT_ENCRYPTION_KEY: 'ab'.repeat(32), S3_BUCKET: 'contract', S3_REGION: 'us-east-1', S3_ENDPOINT: s3URL, S3_FORCE_PATH_STYLE: 'true', S3_ACCESS_KEY_ID: 'fixture', S3_SECRET_ACCESS_KEY: 'fixture', SETUP_TOKEN: 'contract-bootstrap', TRUST_PROXY: '' };
  const goEnv = { PATH: process.env.PATH, HOME: directory, ...config };
  const saved = await contract(await launchGo(goEnv));
  await stopGo();
  await checkPersisted(await launchGo(goEnv), saved);
  await stopGo();
  console.log(`Go backend passed ${assertions} HTTP checks, including persistent posts, sessions, tokens, theme and encrypted settings.`);
} finally {
  await stopGo(); await close(central); await close(s3); await rm(directory, { recursive: true, force: true });
}
