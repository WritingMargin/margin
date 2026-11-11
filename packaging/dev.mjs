import { spawn, execFileSync } from 'node:child_process';

import { mkdirSync } from 'node:fs';
import path from 'node:path';

const binary = path.resolve('artifacts', process.platform === 'win32' ? 'margin-server.exe' : 'margin-server');
mkdirSync(path.dirname(binary), { recursive: true });
execFileSync('go', ['-C', 'backend', 'build', '-o', binary, './cmd/margin-server'], { stdio: 'inherit' });
const children = [
  spawn(binary, ['serve', '--host', '127.0.0.1', '--port', '3001'], { stdio: 'inherit', env: { ...process.env, MARGIN_ENV: 'development' } }),
  spawn(process.execPath, ['node_modules/@react-router/dev/bin.js', 'dev', '--host', '127.0.0.1', '--port', '5173'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
for (const child of children) {
  child.once('error', error => { console.error(error.message); stop(1); });
  child.once('exit', code => stop(code ?? 1));
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
