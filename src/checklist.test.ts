import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checklistExample } from "../shared/checklist";
import { getCompletions } from "./editor-completions";

test("checklists enable scoped accessible tasks without changing ordinary task lists or allowing markup injection", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".checklist-test-"));
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({ stdin: { contents: 'export { default as Markdown } from "./src/Markdown";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, outfile, jsx: "automatic" });
    const { Markdown } = await import(pathToFileURL(outfile).href);
    const render = (content: string) => renderToStaticMarkup(createElement(Markdown, { content, floatingChecklists: true }));
    const html = render('- [ ] Ordinary task\n\n[Checklist title="Prep" floating="true"]\n- [ ] **Wash** tomatoes\n- [x] Measure pasta\n  - [ ] Find a pot\n[/Checklist]');
    assert.match(html, /type="checkbox" disabled=""/);
    assert.match(html, /section class="interactive-checklist" aria-label="Prep"/);
    assert.match(html, /aria-label="Wash tomatoes"/);
    assert.match(html, /aria-label="Measure pasta" checked=""/);
    assert.match(html, /aria-label="Find a pot"/);
    assert.match(html, /<strong>Wash<\/strong>/);
    assert.match(html, /1\/3 complete/);
    assert.equal((html.match(/disabled=""/g) || []).length, 1);
    // The floating enhancement is registered only in a browser; SSR remains readable.
    assert.doesNotMatch(html, /class="checklist-dock"/);
    assert.doesNotMatch(render('```md\n' + checklistExample(true) + '\n```'), /class="interactive-checklist"/);
    const malicious = render('[Checklist title="<img onerror=evil>" floating="position:fixed" onclick="evil()"]\n- [ ] Safe <script>bad()</script>\n[/Checklist]');
    assert.doesNotMatch(malicious, /<script|<img|onclick=|style="position/);
    assert.match(malicious, /&lt;img onerror=evil&gt;/);
    assert.match(render('[Checklist]\nA note without tasks\n[/Checklist]'), /A note without tasks/);
    const nested = render('[Checklist title="Outer"]\n- [ ] Outer task\n[Checklist title="Inner"]\n- [x] Inner task\n[/Checklist]\n[/Checklist]');
    assert.match(nested, /0\/1 complete/);
    assert.match(nested, /1\/1 complete/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("checklist authoring is opt-in with title and floating completions", () => {
  assert.match(checklistExample(), /floating="false"/);
  assert.match(checklistExample(true), /floating="true"/);
  assert.ok(getCompletions('/checklist', 10)?.items.some(item => item.text.includes('[Checklist')));
  const text = '[Checklist floating="';
  const values = getCompletions(text, text.length)?.items.map(item => item.label);
  assert.ok(values?.includes('false'));
  assert.ok(values?.includes('true'));
});
