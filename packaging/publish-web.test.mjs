import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publishWeb } from './publish-web.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'margin-web-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'stage'), target = path.join(root, 'live');
  await mkdir(source);
  await mkdir(path.join(target, 'assets'), { recursive: true });
  await writeFile(path.join(target, 'index.html'), 'old workspace');
  await writeFile(path.join(target, 'public-manifest.json'), 'old manifest');
  await writeFile(path.join(target, 'assets/old.js'), 'open browser still needs this');
  return { source, target };
}

test('publishes new assets and entry documents while retaining assets used by open pages', async t => {
  const { source, target } = await fixture(t);
  await mkdir(path.join(source, 'assets'));
  await writeFile(path.join(source, 'assets/new.css'), 'body { color: green }');
  await writeFile(path.join(source, 'index.html'), '<link href="/assets/new.css">');
  await writeFile(path.join(source, 'public-manifest.json'), '{"new":true}');
  await publishWeb(source, target);
  assert.equal(await readFile(path.join(target, 'assets/new.css'), 'utf8'), 'body { color: green }');
  assert.equal(await readFile(path.join(target, 'index.html'), 'utf8'), '<link href="/assets/new.css">');
  assert.equal(await readFile(path.join(target, 'public-manifest.json'), 'utf8'), '{"new":true}');
  assert.equal(await readFile(path.join(target, 'assets/old.js'), 'utf8'), 'open browser still needs this');
  assert(!(await readdir(target, { recursive: true })).some(name => name.endsWith('.tmp')));
});

test('an incomplete build leaves the live workspace and manifest untouched', async t => {
  const { source, target } = await fixture(t);
  await writeFile(path.join(source, 'index.html'), 'incomplete build');
  await assert.rejects(publishWeb(source, target));
  assert.equal(await readFile(path.join(target, 'index.html'), 'utf8'), 'old workspace');
  assert.equal(await readFile(path.join(target, 'public-manifest.json'), 'utf8'), 'old manifest');
});
