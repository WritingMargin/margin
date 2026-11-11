import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { publishWeb } from './publish-web.mjs';

await mkdir('dist', { recursive: true });
const stage = await mkdtemp(path.resolve('dist/.web-build-'));
const env = { ...process.env, MARGIN_WEB_BUILD_DIR: stage, MARGIN_WEB_BUILD_BASE: '/__margin_runtime_base__' };
function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Frontend build failed: ${script} (${result.signal || result.status})`);
}
try {
  run('node_modules/@react-router/dev/bin.js', ['build']);
  const shell = await readFile(path.join(stage, 'client/index.html'));
  const worker = await readFile('packaging/offline-worker.js', 'utf8');
  const hash = createHash('sha256').update(shell).digest('hex').slice(0, 12);
  await writeFile(path.join(stage, 'client/offline-worker.js'), worker.replace('__MARGIN_BUILD_HASH__', hash));
  run('node_modules/vite/bin/vite.js', ['build', '--config', 'vite.public.config.ts']);
  const swaggerAssets = path.join(stage, 'client/swagger-ui');
  await mkdir(swaggerAssets, { recursive: true });
  for (const name of ['swagger-ui-bundle.js', 'swagger-ui.css', 'LICENSE']) {
    await copyFile(path.join('node_modules/swagger-ui-dist', name), path.join(swaggerAssets, name));
  }
  await publishWeb(path.join(stage, 'client'), path.resolve(process.env.MARGIN_WEB_OUTPUT || 'dist/client'));
} finally {
  await rm(stage, { recursive: true, force: true });
}
