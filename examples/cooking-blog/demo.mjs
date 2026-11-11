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
const state = path.join(root, 'artifacts/cooking-blog-demo');
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
const child = spawn(path.join(root, 'artifacts/margin-server'), ['serve', '--host', '127.0.0.1', '--port', process.env.MARGIN_DEMO_PORT || '53242', '--web-dir', path.join(root, 'dist/client')], {
  cwd: state,
  env: { PATH: process.env.PATH, MARGIN_ENV: 'test', PUBLIC_URL: '', SQLITE_PATH: path.join(state, 'margin.db'), AI_SERVICE_URL: centralURL, CONTENT_ENCRYPTION_KEY: encryptionKey, S3_BUCKET: 'demo', S3_REGION: 'us-east-1', S3_ENDPOINT: storageURL, S3_FORCE_PATH_STYLE: 'true', S3_ACCESS_KEY_ID: 'demo-fixture', S3_SECRET_ACCESS_KEY: 'demo-fixture', SETUP_TOKEN: 'cooking-blog-demo' },
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
    ? await call('/api/setup', 'POST', { ...credentials, setupToken: 'cooking-blog-demo' }, 201)
    : await call('/api/login', 'POST', credentials);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const theme = await (await call('/api/settings')).json();
  const design = (id, type) => catalog.content.find(item => item.id === id).designs[type];
  const pastaPhoto = 'https://images.unsplash.com/photo-1498579150354-977475b7ea0b?auto=format&fit=crop&w=1600&q=85';
  const bowlPhoto = 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=85';
  const skillsPhoto = 'https://images.pexels.com/photos/8629044/pexels-photo-8629044.jpeg?auto=compress&cs=tinysrgb&w=1200';
  const palette = { background: '#f7f4ec', text: '#293524', accent: '#42543b' };
  const selected = {
    ...theme, ...palette, name: 'Supper Club', description: 'Simple recipes. Small kitchen victories. A good dinner, any day of the week.', publicationType: 'blog',
    footerTitle: 'Supper Club — Good food, made at home.', showFooterTitle: true,
    homepage: {
      ...theme.homepage, ...catalog.homepage.find(item => item.id === 'journal').design, ...palette,
      title: 'A little time. A very good dinner.', description: 'Simple recipes, useful little lessons, and a place to cook along. Pull up a chair.',
      tagline: 'EVERYDAY FOOD, A LITTLE MORE JOY', showTagline: true, font: 'dm-sans', headingFont: 'playfair', headingScale: 'display', spacing: 'airy',
      layout: 'grid', gridColumns: 'two', cardStyle: 'flat', radius: 8, imageRatio: 'landscape', showImages: true, showDates: false, showTags: true,
      showNumbers: false, showPostCount: false, showFeedHeading: false, showFeatured: false, includeFeaturedInFeed: true,
      showSearch: true, showTopicFilters: true, searchPosition: 'above', pageSize: 10,
      sections: [
        { id: 'welcome', component: 'hero', variant: 'split', props: { source: 'featured', title: 'A little time. A very good dinner.', description: 'Simple recipes, useful little lessons, and a place to cook along. Pull up a chair.', image: pastaPhoto, buttonLabel: 'Cook with us', buttonHref: '/post/pasta-cook-along' } },
        { id: 'stories', component: 'post-feed' },
      ], sectionSpacing: 'airy',
    },
    article: { ...design('feature', 'article'), ...palette, font: 'source-serif', headingFont: 'playfair', headerLayout: 'split', headingScale: 'standard', spacing: 'standard', showDates: false, showExcerpt: true, measure: 'reading', bodySize: 'regular', lineSpacing: 'relaxed', tableOfContents: { title: 'In the kitchen', style: 'plain', maxDepth: 2, width: 200 } },
    guide: { ...design('handbook', 'guide'), ...palette, font: 'dm-sans', headingFont: 'playfair', headerLayout: 'standard', showCover: false, showExcerpt: true, showDates: false, bodySize: 'regular', measure: 'wide', tableOfContents: { title: 'Your cook-along', style: 'filled', maxDepth: 2, width: 210, radius: 8 } },
    comments: { ...theme.comments, visible: false },
  };
  await call('/api/settings', 'PUT', selected);
  const examples = [
    { file: 'videos.md', slug: 'watch-and-cook', title: 'Watch a little. Cook a little.', contentType: 'article', outline: 'essay', tableOfContents: 'off', cover: skillsPhoto, tags: ['Kitchen skills', 'Videos'], excerpt: 'Two small skills that make everyday cooking feel easier. Press play, then have a go.' },
    { file: 'chickpea-bowl.md', slug: 'lemon-chickpea-bowl', title: 'The bright little chickpea bowl', contentType: 'article', outline: 'essay', tableOfContents: 'left', cover: bowlPhoto, tags: ['Recipes', '15 minutes'], excerpt: 'Crunchy vegetables, lemon dressing, and a generous handful of herbs. Your no-cook lunch is sorted.' },
    { file: 'tomato-pasta.md', slug: 'tomato-basil-pasta', title: 'Tomato, basil & a very good bowl of pasta', contentType: 'article', outline: 'essay', tableOfContents: 'left', cover: pastaPhoto, featured: true, tags: ['Recipes', 'Weeknight favourites'], excerpt: 'Sweet tomatoes, warm garlic, and a glossy sauce. A simple supper in about 25 minutes.' },
    { file: 'cook-along.md', slug: 'pasta-cook-along', title: 'Let’s make dinner, together.', contentType: 'guide', outline: 'user-guide', tableOfContents: 'left', cover: pastaPhoto, tags: ['Cook along', 'Beginner friendly'], excerpt: 'Choose your servings. Follow the steps. Learn to read your pan. An interactive guide to tomato pasta.' },
  ];
  const existing = await (await call('/api/posts')).json();
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
