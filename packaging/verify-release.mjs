import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [binary, version, target] = process.argv.slice(2);
const nativeOS = process.platform === 'win32' ? 'windows' : process.platform;
const nativeArch = process.arch === 'x64' ? 'amd64' : process.arch;
if (target === `${nativeOS}_${nativeArch}` || target === `${nativeOS}_${nativeArch}_v1` || target === `${nativeOS}_${nativeArch}_v8.0`) {
  execFileSync(process.execPath, [fileURLToPath(new URL('./smoke.mjs', import.meta.url)), binary, version], { stdio: 'inherit' });
  execFileSync(process.execPath, [fileURLToPath(new URL('./runtime-path-smoke.mjs', import.meta.url)), binary], { stdio: 'inherit' });
}
