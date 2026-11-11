import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseBlock } from '../src/blocks/schema.ts';

const exec = promisify(execFile);
// Exercise the standalone binary and verify the complete embedded skill installation without host credentials.
test('native CLI runs outside the repo without runtimes and installs embedded skills safely', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'margin-package-'));
  try {
    await exec('go', ['-C', 'cli', 'run', './cmd/build']);
    const executable = path.join(temporary, process.platform === 'win32' ? 'margin.exe' : 'margin');
    await cp(path.join('cli/dist', path.basename(executable)), executable);
    const emptyPath = path.join(temporary, 'empty-path');
    await mkdir(emptyPath);
    const options = { cwd: temporary, env: { PATH: emptyPath, HOME: temporary, USERPROFILE: temporary, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) } };
    const metadata = JSON.parse(await readFile('package.json', 'utf8'));
    assert.equal((await exec(executable, ['--version'], options)).stdout.trim(), metadata.version);
    assert.match((await exec(executable, ['help'], options)).stdout, /publish <id>/);
    const nginx = JSON.parse((await exec(executable, ['deploy', 'nginx', '--domain', 'blog.example.test', '--json'], options)).stdout);
    assert.equal(nginx.tls, true); assert.match(nginx.config, /proxy_pass http:\/\/127\.0\.0\.1:3001;/);
    await exec(executable, ['deploy', 'apache', '--domain', 'blog.example.test', '--http-only', '--output', 'apache.conf'], options);
    assert.match(await readFile(path.join(temporary, 'apache.conf'), 'utf8'), /ProxyPass "\/" "http:\/\/127\.0\.0\.1:3001\/"/);
    await assert.rejects(exec(executable, ['deploy', 'apache', '--domain', 'blog.example.test', '--output', 'apache.conf'], options), /already exists/);
    const list = JSON.parse((await exec(executable, ['skills', 'list', '--json'], options)).stdout);
    assert.deepEqual(list.map((skill: { name: string }) => skill.name), ['margin-authoring', 'engineering-writing']);
    const workingDirectory = await realpath(temporary);
    for (const { name } of list) {
      await verifyBundledSkill(name, executable, workingDirectory, options);
    }
    for (const name of ['../other', 'unknown', '../engineering-writing']) {
      await assert.rejects(exec(executable, ['skills', 'show', name], options));
      await assert.rejects(exec(executable, ['skills', 'install', name, '--dir', 'agent-skills'], options));
    }
    await assert.rejects(exec(executable, ['skills', 'list', '--publish'], options));
    await assert.rejects(exec(executable, ['list', '--json'], options), (error: unknown) => {
      const failure = error as { code: number; stdout: string; stderr: string };
      assert.equal(failure.code, 1); assert.equal(failure.stdout, '');
      assert.match(JSON.parse(failure.stderr).error, /MARGIN_TOKEN/);
      return true;
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('bundled authoring examples contain valid interactive content', async () => {
  const reference = await readFile('cli/skills/margin-authoring/references/content.md', 'utf8');
  for (const [tag, language] of [['Chart', 'chart'], ['Scene', 'scene']] as const) {
    const body = reference.match(new RegExp(`\\[${tag}\\]\\n([\\s\\S]*?)\\n\\[/${tag}\\]`))?.[1];
    assert.ok(body); assert.equal(parseBlock(language, body).kind, language);
  }
});

async function verifyBundledSkill(name: string, executable: string, workingDirectory: string, options: { cwd: string; env: NodeJS.ProcessEnv }) {
      const skill = JSON.parse((await exec(executable, ['skills', 'show', name, '--json'], options)).stdout);
      assert.equal(skill.content, await readFile(`cli/skills/${name}/SKILL.md`, 'utf8'));
      // The authoring skill includes the block and design contracts used by the editor and API.
      const expectedReferences = name === 'margin-authoring' ? ['references/blocks.json', 'references/cli.md', 'references/content.md', 'references/design.json', 'references/design.md', 'references/preview.md'] : [];
      assert.deepEqual(Object.keys(skill.references).sort(), expectedReferences);
      const expectedScripts = name === 'margin-authoring' ? ['scripts/preview-diagrams.mjs'] : [];
      assert.deepEqual(Object.keys(skill.scripts).sort(), expectedScripts);
      const shown = (await exec(executable, ['skills', 'show', name], options)).stdout;
      assert.ok(shown.includes(skill.content));
      for (const reference of expectedReferences) {
        const source = await readFile(`cli/skills/${name}/${reference}`, 'utf8');
        assert.equal(skill.references[reference], source);
        assert.ok(shown.includes(source));
      }
      for (const { directory, args } of [
        { directory: path.join('.agents', 'skills'), args: [] },
        { directory: 'agent-skills', args: ['--dir', 'agent-skills'] },
      ]) {
        const installed = JSON.parse((await exec(executable, ['skills', 'install', name, ...args, '--json'], options)).stdout);
        assert.equal(installed.path, path.join(workingDirectory, directory, name, 'SKILL.md'));
        assert.equal(await readFile(installed.path, 'utf8'), skill.content);
        for (const reference of expectedReferences) {
          assert.equal(await readFile(path.join(path.dirname(installed.path), reference), 'utf8'), skill.references[reference]);
        }
        for (const script of expectedScripts) {
          const source = await readFile(`cli/skills/${name}/${script}`, 'utf8');
          const installedScript = path.join(path.dirname(installed.path), script);
          assert.equal(skill.scripts[script], source);
          assert.equal(await readFile(installedScript, 'utf8'), source);
          assert.match((await exec(process.execPath, [installedScript, '--help'], options)).stdout, /--repo CHECKOUT/);
        }
        await writeFile(installed.path, 'Owner customization');
        await assert.rejects(exec(executable, ['skills', 'install', name, ...args], options), /already exists/);
        assert.equal(await readFile(installed.path, 'utf8'), 'Owner customization');
      }
      for (const directory of ['', '   ']) {
        await assert.rejects(exec(executable, ['skills', 'install', name, '--dir', directory], options), /non-empty directory/);
      }
      await assert.rejects(exec(executable, ['skills', 'install', name, '--dir'], options), /requires a value/);
}
