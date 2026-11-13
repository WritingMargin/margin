import { createHash } from 'node:crypto';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const snapshot = JSON.parse(await readFile(new URL('../backend/internal/blog/plan-catalog.generated.json', import.meta.url), 'utf8'));
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.sha256, createHash('sha256').update(JSON.stringify({ plans: snapshot.plans, packs: snapshot.packs })).digest('hex'), 'Generated plan catalog was edited. Regenerate it from Margin Central.');
// Standalone Engine checkouts use the committed snapshot. When Central is
// checked out alongside the Engine, also enforce agreement with its source.
const generator = new URL('../margin-central/packaging/generate-plan-catalog.mjs', import.meta.url);
if (await access(generator).then(() => true, () => false)) {
  const result = spawnSync(process.execPath, [fileURLToPath(generator), '--check', '--engine', root], { stdio: 'inherit' });
  assert.equal(result.status, 0, 'Plan definitions are out of sync with Margin Central');
}
