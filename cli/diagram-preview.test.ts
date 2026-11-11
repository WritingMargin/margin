import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
const playwright = process.env.MARGIN_PREVIEW_PLAYWRIGHT;
const browser = process.env.MARGIN_PREVIEW_BROWSER;

test('diagram preview preserves input, captures both widths, reports errors and scrolling, and blocks remote media', {
  skip: !playwright || !browser ? 'Set MARGIN_PREVIEW_PLAYWRIGHT and MARGIN_PREVIEW_BROWSER to run the real-browser preview regression.' : false,
}, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'margin-preview-test-'));
  try {
    const input = path.join(temporary, 'article.md');
    const output = path.join(temporary, 'preview');
    const source = `![Remote media](https://example.invalid/should-never-load.png)

[Diagram height="200"]
flowchart TD
  accTitle: Preview regression
  accDescr: A tall ordered flow used to check the captured viewport.
  A[Start] --> B[Read] --> C[Check] --> D[Write] --> E[Review] --> F[Finish]
[/Diagram]

[Diagram]
this is not a Mermaid diagram
[/Diagram]
`;
    await writeFile(input, source);
    const args = [path.resolve('cli/skills/margin-authoring/scripts/preview-diagrams.mjs'),
      '--repo', process.cwd(), '--file', input, '--out', output,
      '--playwright', playwright!, '--browser', browser!];
    await assert.rejects(exec(process.execPath, args, { timeout: 60000 }), (error: unknown) => {
      assert.equal((error as { code: number }).code, 2);
      return true;
    });
    const report = JSON.parse(await readFile(path.join(output, 'report.json'), 'utf8'));
    assert.deepEqual(report.views.map((view: { width: number }) => view.width), [1100, 390]);
    for (const view of report.views) {
      assert.equal(view.diagrams.length, 2);
      assert.equal(view.diagrams[0].rendered, true);
      assert.equal(view.diagrams[0].title, 'Preview regression');
      assert.ok(view.diagrams[0].labels.some((label: { text: string }) => label.text === 'Finish'));
      assert.ok(view.diagrams[0].minScreenFontPx > 0);
      assert.equal(view.diagrams[0].verticalScroll, true);
      assert.equal(view.diagrams[1].rendered, false);
      assert.ok(view.diagrams[1].errors.length);
      assert.ok(view.blockedRequests.includes('https://example.invalid/should-never-load.png'));
      for (const diagram of view.diagrams) assert.ok((await readFile(path.join(output, diagram.screenshot))).length > 1000);
    }
    const capturedReport = await readFile(path.join(output, 'report.json'), 'utf8');
    await assert.rejects(exec(process.execPath, args), /EEXIST/);
    assert.equal(await readFile(path.join(output, 'report.json'), 'utf8'), capturedReport);
    assert.equal(await readFile(input, 'utf8'), source);
    assert.equal(await readFile(path.join(output, 'input.md'), 'utf8'), source);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
