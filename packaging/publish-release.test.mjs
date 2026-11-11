import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publishRelease } from './publish-release.mjs';

const repo = 'WritingMargin/margin';
const sha = 'a'.repeat(40);
const tag = 'v1.0.2';
const latestImage = 'docker://ghcr.io/writingmargin/margin:latest';

function candidate(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'margin-publisher-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'checksums.txt'), '');
  for (const os of ['darwin', 'linux']) for (const arch of ['amd64', 'arm64']) {
    for (const binary of ['margin', 'margin-cli']) writeFileSync(path.join(dir, `${binary}_1.0.2_${os}_${arch}.tar.gz`), '');
  }
  return dir;
}

function publish(dir, releases) {
  const calls = [];
  publishRelease(repo, sha, tag, dir, (...args) => {
    calls.push(args);
    if (args[0] === 'gh' && args[1] === 'api') return releases.map(r => JSON.stringify(r)).join('\n');
    return '';
  });
  return calls;
}

test('an older publisher can finish last without replacing either latest pointer', t => {
  const calls = publish(candidate(t), [{ tag_name: 'v1.0.10', draft: false }]);
  assert.ok(calls.some(args => args.at(-1) === 'docker://ghcr.io/writingmargin/margin:v1.0.2'));
  assert.ok(calls.some(args => args.includes('--latest=false')));
  assert.ok(!calls.some(args => args.includes(latestImage)));
});

test('retry after publishing GitHub only repairs the missing registry promotion', () => {
  const calls = publish('/no-candidate-needed', [{ tag_name: tag, draft: false }]);
  assert.deepEqual(calls.slice(1), [['git', 'push', 'origin', `${sha}:refs/tags/${tag}`], ['skopeo', 'copy', '--all', '--preserve-digests', 'docker://ghcr.io/writingmargin/margin:v1.0.2', latestImage]]);
});

test('a newer draft does not prevent a ready version becoming stable', t => {
  const calls = publish(candidate(t), [{ tag_name: 'v1.0.3', draft: true }]);
  assert.ok(calls.some(args => args.includes('--latest=true')));
  assert.equal(calls.at(-1).at(-1), latestImage);
});
