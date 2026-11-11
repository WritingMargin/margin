import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

// Exercises the real CLI process and HTTP requests, without external credentials.
test('CLI reads, searches, streams stdin, and safely patches with revision guards', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'margin-cli-integration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const binary = path.join(directory, process.platform === 'win32' ? 'margin.exe' : 'margin');
  execFileSync('go', ['build', '-o', binary, './cmd/margin'], { cwd: 'cli' });
  let post = { id: 'post-one', title: 'Design notes', slug: 'design-notes', status: 'draft', content: 'First\nTODO: review\nLast\n', revision: 'rev1' };
  let puts = 0;
  let conflict = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer test-token') { res.statusCode = 401; res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
    if (req.method === 'GET') { res.end(JSON.stringify(req.url === '/api/posts' ? [{ ...post, content: undefined }] : post)); return; }
    if (req.method === 'POST' && req.url === '/api/posts') {
      post = { ...await readRequestBody(req), id: 'created-post', revision: 'created-revision' };
      res.statusCode = 201; res.end(JSON.stringify(post)); return;
    }
    if (req.method === 'PUT') {
      puts++;
      const body = await readRequestBody(req);
      if (conflict || body.revision !== post.revision) { res.statusCode = 409; res.end(JSON.stringify({ error: 'Post changed', code: 'REVISION_CONFLICT' })); return; }
      post = { ...post, ...body, revision: 'rev2' }; res.end(JSON.stringify(post)); return;
    }
    res.statusCode = 405; res.end(JSON.stringify({ error: 'Unexpected write' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const run = (args: string[], input?: string, json = true) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(binary, [...args, ...(json ? ['--json'] : [])], { env: { ...process.env, MARGIN_URL: url, MARGIN_TOKEN: 'test-token' }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(input);
  });
  let result = await run(['get', post.id, '--lines', '2:2']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).lines, [{ line: 2, text: 'TODO: review' }]);
  assert.equal(JSON.parse(result.stdout).revision, 'rev1');
  result = await run(['find', 'DESIGN']);
  assert.equal(JSON.parse(result.stdout)[0].id, post.id);
  result = await run(['grep', '^TODO']);
  assert.deepEqual(JSON.parse(result.stdout)[0], { id: post.id, slug: post.slug, line: 2, text: 'TODO: review', revision: 'rev1' });
  result = await run(['grep', '^TODO'], undefined, false);
  assert.equal(result.stdout, 'post-one:2:TODO: review\n');
  result = await run(['update', post.id, '--lines', '2:2', '--file', '-', '--revision', 'rev1'], 'Reviewed\n');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(post.content, 'First\nReviewed\nLast\n');
  assert.equal(puts, 1);
  result = await run(['update', post.id, '--lines', '2:2', '--text', 'Stale', '--revision', 'rev1']);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stderr).code, 'REVISION_CONFLICT');
  assert.equal(puts, 1, 'stale caller revision must never issue a write');
  result = await run(['update', post.id, '--lines', '2:99', '--text', 'Invalid', '--revision', post.revision]);
  assert.equal(result.code, 1);
  assert.equal(puts, 1, 'invalid range must never issue a write');
  conflict = true;
  result = await run(['update', post.id, '--lines', '2:2', '--text', 'Concurrent', '--revision', post.revision]);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stderr).code, 'REVISION_CONFLICT');
  assert.equal(puts, 2, 'conflicts must not automatically retry');
  assert.equal(post.content, 'First\nReviewed\nLast\n');
  result = await run(['delete', post.id]);
  assert.equal(result.code, 1);
  assert.match(JSON.parse(result.stderr).error, /--yes/);
  result = await run(['publish', post.id, '--revision', post.revision]);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stderr).code, 'REVISION_CONFLICT');
  assert.equal(post.status, 'draft');
  conflict = false;
  result = await run(['create', '--title', 'New writing', '--slug', 'new-writing', '--file', '-'], '## Hello\n\n[Font="Caveat"]An aside.[/Font]\n');
  assert.equal(result.code, 0, result.stderr); assert.equal(post.status, 'draft');
  assert.equal(post.content, '## Hello\n\n[Font="Caveat"]An aside.[/Font]\n');
  const createdContent = post.content;
  result = await run(['publish', post.id, '--revision', 'stale']);
  assert.equal(result.code, 1); assert.equal(post.status, 'draft');
  result = await run(['publish', post.id, '--revision', post.revision]);
  assert.equal(result.code, 0, result.stderr); assert.equal(post.status, 'published'); assert.equal(post.content, createdContent);
  const publishedPuts = puts;
  result = await run(['publish', post.id, '--revision', post.revision]);
  assert.equal(result.code, 0); assert.equal(puts, publishedPuts, 'already published is a no-op');
  result = await run(['unpublish', post.id, '--revision', post.revision]);
  assert.equal(result.code, 0); assert.equal(post.status, 'draft'); assert.equal(post.content, createdContent);
  result = await run(['create', '--title', 'Immediate', '--slug', 'immediate', '--text', 'Ready to read.', '--publish']);
  assert.equal(result.code, 0); assert.equal(post.status, 'published');
});

async function readRequestBody(request: http.IncomingMessage) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
