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
const state = path.join(root, 'artifacts/content-formats-demo');
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
const child = spawn(path.join(root, 'artifacts/margin-server'), ['serve', '--host', '127.0.0.1', '--port', process.env.MARGIN_DEMO_PORT || '53241', '--web-dir', path.join(root, 'dist/client')], {
  cwd: state,
  env: { PATH: process.env.PATH, MARGIN_ENV: 'test', PUBLIC_URL: '', SQLITE_PATH: path.join(state, 'margin.db'), AI_SERVICE_URL: centralURL, CONTENT_ENCRYPTION_KEY: encryptionKey, S3_BUCKET: 'demo', S3_REGION: 'us-east-1', S3_ENDPOINT: storageURL, S3_FORCE_PATH_STYLE: 'true', S3_ACCESS_KEY_ID: 'demo-fixture', S3_SECRET_ACCESS_KEY: 'demo-fixture', SETUP_TOKEN: 'content-formats-demo' },
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
    ? await call('/api/setup', 'POST', { ...credentials, setupToken: 'content-formats-demo' }, 201)
    : await call('/api/login', 'POST', credentials);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const theme = await (await call('/api/settings')).json();
  const design = (id, type) => catalog.content.find(item => item.id === id).designs[type];
  const selected = {
    ...theme, name: 'Margin field notes', description: 'Three ways to turn what you know into something useful.', publicationType: 'article',
    homepage: { ...theme.homepage, ...catalog.homepage.find(item => item.id === 'magazine').design, title: 'Good knowledge deserves the right format.', description: 'A playbook to follow. A guide to learn. An article to consider.', tagline: 'THE CONTENT COLLECTION', showHero: true, heroLayout: 'centered', showArtwork: false, layout: 'grid', gridColumns: 'two', showImages: false, showDates: false, showTags: true, pageSize: 10 },
    article: { ...design('essay', 'article'), showExcerpt: true, showDates: false },
    guide: { ...design('handbook', 'guide'), background: '#f7f9fc', accent: '#2858ae', tableOfContents: { title: 'In this guide', style: 'filled', maxDepth: 2, width: 220 } },
    comments: { ...theme.comments, visible: false },
  };
  await call('/api/settings', 'PUT', selected);
  const examples = [
    { file: 'playbook.md', slug: 'release-day-playbook', title: 'The release-day publishing playbook', contentType: 'guide', outline: 'playbook', tableOfContents: 'left', tags: ['Playbook', 'Team process'], excerpt: 'A repeatable path from a finished feature to a clear, checked customer update.' },
    { file: 'guide.md', slug: 'your-first-margin-guide', title: 'Create your first guide in Margin', contentType: 'guide', outline: 'user-guide', tableOfContents: 'left', tags: ['User guide', 'Getting started'], excerpt: 'From a blank draft to a published page: choose an outline, write, preview, and share.' },
    { file: 'article.md', slug: 'documentation-is-product-design', title: 'Documentation is part of the design', contentType: 'article', outline: 'essay', tableOfContents: 'off', tags: ['Article', 'Product thinking'], excerpt: 'Writing the explanation is one way to discover whether the product makes sense.' },
  ];
  const existing = await (await call('/api/posts')).json();
  // Retire the removed documentation sample without deleting its saved content.
  const retired = existing.find(item => item.slug === 'content-types-reference');
  if (retired && retired.status !== 'archived') await call(`/api/posts/${retired.id}`, 'PUT', { revision: retired.revision, status: 'archived' });
  const checks = [];
  for (const example of examples) {
    const outline = catalog.writing.find(item => item.id === example.outline);
    assert.ok((outline.supportedContentTypes ?? ['article']).includes(example.contentType));
    const { file, outline: _, ...fields } = example;
    const payload = { ...fields, content: await readFile(path.join(source, file), 'utf8'), status: 'draft', recommendations: { mode: 'manual', postIds: [] } };
    const old = existing.find(item => item.slug === example.slug);
    const draft = await (await call(old ? `/api/posts/${old.id}` : '/api/posts', old ? 'PUT' : 'POST', { ...payload, ...(old ? { revision: old.revision } : {}) }, old ? 200 : 201)).json();
    await call(`/api/public/posts/${example.slug}`, 'GET', undefined, 404, false);
    const published = await (await call(`/api/posts/${draft.id}`, 'PUT', { revision: draft.revision, status: 'published' })).json();
    const detail = await (await call(`/api/public/posts/${example.slug}`, 'GET', undefined, 200, false)).json();
    assert.equal(detail.contentType, example.contentType);
    assert.equal(detail.content, payload.content);
    const html = await (await call(`/post/${example.slug}`, 'GET', undefined, 200, false)).text();
    assert.ok(html.includes(`data-content-type="${example.contentType}"`));
    assert.ok(html.includes(example.title.replaceAll('&', '&amp;')));
    if (example.tableOfContents !== 'off') assert.ok(html.includes('Table of contents'));
    const download = await (await call(`/posts/${example.slug}.md?download=1`, 'GET', undefined, 200, false)).text();
    assert.ok(download.includes(payload.content.trim()));
    await call(`/post/${example.slug}/print`, 'GET', undefined, 200, false);
    checks.push({ title: example.title, contentType: example.contentType, id: published.id, url: `${base}/post/${example.slug}`, checks: ['draft privacy', 'revision-checked publication', 'type persistence', 'public HTML', 'Markdown export', 'print view'] });
  }
  await writeFile(path.join(state, 'results.json'), JSON.stringify({ base, examples: checks }, null, 2));
  console.log(JSON.stringify({ base, examples: checks }, null, 2));
} catch (error) { stop(); throw error; }
