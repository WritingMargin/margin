import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const execute = (cmd, ...args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

function releaseAssets(dir, tag) {
  const files = readdirSync(dir).filter(f => f.endsWith('.tar.gz') || f === 'checksums.txt');
  const expected = ['checksums.txt'];
  for (const binary of ['margin', 'margin-cli']) {
    for (const os of ['darwin', 'linux']) {
      for (const arch of ['amd64', 'arm64']) expected.push(`${binary}_${tag.slice(1)}_${os}_${arch}.tar.gz`);
    }
  }
  if (files.length !== expected.length || expected.some(f => !files.includes(f))) throw new Error('Incomplete release assets');
  return files;
}

export function publishRelease(repo, sha, tag, dir, run = execute) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('Invalid release identity');
  const image = 'ghcr.io/' + repo.toLowerCase();
  const rows = run('gh', 'api', '--paginate', `repos/${repo}/releases?per_page=100`,
    '--jq', '.[] | {tag_name, draft, prerelease} | @json');
  const releases = rows.split('\n').filter(Boolean).map(row => JSON.parse(row));
  const existing = releases.find(r => r.tag_name === tag);
  const active = releases.filter(r => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name));
  // A later push may finish CI first. Publish this version's assets regardless,
  // but only the most recent stable version can advance the two latest pointers.
  const promote = !active.some(r => tag.localeCompare(r.tag_name, 'en', { numeric: true }) < 0);

  const needsAssets = !existing || existing.draft;
  const assets = needsAssets ? releaseAssets(dir, tag) : [];
  // Pushing the exact commit also rejects a retry against a conflicting tag.
  run('git', 'push', 'origin', `${sha}:refs/tags/${tag}`);
  if (needsAssets) {
    run('skopeo', 'copy', '--all', '--preserve-digests', 'oci-archive:' + path.join(dir, 'image.tar'), `docker://${image}:${tag}`);
    if (!existing) run('gh', 'release', 'create', tag, '--verify-tag', '--draft', '--title', tag, '--notes-file', path.join(dir, 'CHANGELOG.md'));
    run('gh', 'release', 'upload', tag, '--clobber', ...assets.map(f => path.join(dir, f)));
    run('gh', 'release', 'edit', tag, '--draft=false', '--latest=' + promote);
  }
  if (promote) {
    // Record the GitHub release first so a retry, or an older run after a
    // partial failure, cannot move the registry's latest tag backwards.
    run('skopeo', 'copy', '--all', '--preserve-digests', `docker://${image}:${tag}`, `docker://${image}:latest`);
  }
  console.log(promote ? `Published stable ${tag}` : `Published ${tag}; a newer release is already stable`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishRelease(process.env.GITHUB_REPOSITORY, process.env.GITHUB_SHA, process.env.RELEASE_TAG, path.resolve('candidate'));
}
