import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const stable = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const parts = tag => {
  if (!stable.test(tag)) throw new Error(`Expected a stable version, got ${tag}`);
  const numbers = tag.slice(1).split('.').map(Number);
  if (!numbers.every(Number.isSafeInteger)) throw new Error('Version components are too large');
  return numbers;
};
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

git('fetch', 'origin', '--tags');
const tags = new Map();
for (const ref of git('for-each-ref', '--format=%(refname:strip=2) %(objectname) %(*objectname)', 'refs/tags').split('\n')) {
  const [tag, object, peeled] = ref.split(' ');
  if (!stable.test(tag)) continue;
  const sha = peeled || object;
  const version = parts(tag);
  if (!tags.has(sha) || compare(version, tags.get(sha)) > 0) tags.set(sha, version);
}

// Allocate a patch per mainline commit since the last release, including
// commits still in CI. Finishing out of order cannot change a build's version.
const commits = git('rev-list', '--first-parent', 'HEAD').split('\n');
const anchor = commits.findIndex(commit => tags.has(commit));
let version = tags.get(commits[anchor]);
for (const commit of commits.slice(0, anchor < 0 ? commits.length : anchor).reverse()) {
  // A main push may merge an already-released line as its second parent.
  for (const reachable of git('tag', '--merged', commit).split('\n').filter(t => stable.test(t))) {
    const released = parts(reachable);
    if (!version || compare(released, version) > 0) version = released;
  }
  const base = parts('v' + JSON.parse(git('show', commit + ':package.json')).version);
  version = !version || compare(base, version) > 0 ? base : [version[0], version[1], version[2] + 1];
}
const tag = 'v' + version.join('.');
parts(tag);
if (!git('tag', '--points-at', 'HEAD').split('\n').includes(tag)) git('tag', tag, 'HEAD');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
console.log(`Release ${tag} for ${commits[0]}`);
