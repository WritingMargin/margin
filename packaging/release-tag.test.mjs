import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('candidate versions start at the package version and survive retries and out-of-order builds', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'margin-release-tags-'));
  const remote = path.join(root, 'origin.git');
  const checkout = path.join(root, 'checkout');
  const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GITHUB_OUTPUT: '' } }).trim();
  const git = (...args) => run('git', args, checkout);
  try {
    run('git', ['init', '--bare', remote]);
    run('git', ['clone', remote, checkout]);
    git('config', 'user.name', 'Release test');
    git('config', 'user.email', 'release@example.invalid');
    const commit = version => {
      writeFileSync(path.join(checkout, 'package.json'), JSON.stringify({ version }));
      git('add', 'package.json');
      git('commit', '--allow-empty', '-m', 'Test version');
    };
    const release = () => run(process.execPath, [fileURLToPath(new URL('./release-tag.mjs', import.meta.url))], checkout);
    commit('1.0.0');
    assert.match(release(), /Release v1\.0\.0 for/);
    const first = git('rev-parse', 'v1.0.0');
    assert.match(release(), /Release v1\.0\.0 for/);
    commit('1.0.0');
    assert.match(release(), /Release v1\.0\.1 for/);
    git('tag', 'v9.0.0-rc.1');
    commit('2.0.0');
    assert.match(release(), /Release v2\.0\.0 for/);
    assert.equal(git('rev-parse', 'v1.0.0'), first);
    assert.equal(git('ls-remote', '--tags', 'origin'), '');
    git('push', 'origin', 'refs/tags/v2.0.0');
    commit('2.0.0');
    const older = git('rev-parse', 'HEAD');
    commit('2.0.0');
    const newer = git('rev-parse', 'HEAD');
    assert.match(release(), /Release v2\.0\.2 for/);
    git('push', 'origin', 'refs/tags/v2.0.2');
    git('checkout', '--detach', older);
    assert.match(release(), /Release v2\.0\.1 for/);
    git('push', 'origin', 'refs/tags/v2.0.1');
    git('checkout', '--detach', newer);
    assert.match(release(), /Release v2\.0\.2 for/);
    commit('not-a-version');
    assert.throws(release, /Expected a stable version/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
