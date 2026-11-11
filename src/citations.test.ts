import assert from "node:assert/strict";
import test from "node:test";
import { citationTarget, citationTag, citationRect, expandCitations } from "../shared/citations";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = { url: "https://example.com/article", title: 'A "source" & more', quote: "An exact quote, with a dash-and spaces.", page: "", rect: "" };
test("citation links locate websites, external PDF pages and saved PDF highlights", () => {
  assert.equal(citationTarget(source), "https://example.com/article#:~:text=An%20exact%20quote%2C%20with%20a%20dash%2Dand%20spaces.");
  assert.equal(citationTarget({ ...source, url: "https://example.com/a.pdf", page: "12" }), "https://example.com/a.pdf#page=12");
  assert.equal(citationTarget({ ...source, url: "/api/public/documents/12345678-1234-1234-1234-123456789abc", page: "2", rect: "0.1,0.2,0.5,0.1" }), "/sources/12345678-1234-1234-1234-123456789abc?page=2&rect=0.1%2C0.2%2C0.5%2C0.1");
  for (const url of ["javascript:alert(1)", "data:text/html,bad", "//example.com", "https://user:secret@example.com", "/admin"]) assert.equal(citationTarget({ ...source, url }), "");
  for (const rect of ["NaN,0,1,1", "0,0,2,1", "-1,0,1,1", "0,0,0,1"]) assert.equal(citationRect(rect), undefined);
});
test("only explicit complete citation tags outside code and links become citations", () => {
  const tag = citationTag(source, "Important **words**");
  assert.match(expandCitations(tag), /^:citation\[Important \*\*words\*\*\]/);
  for (const literal of ["Ordinary > quoted words", `\`${tag}\``, `\`\`\`\n${tag}\n\`\`\``, `    ${tag}`, `\\${tag}`, `[${tag}](https://example.org)`, '[Citation url="https://example.com"]Unclosed']) assert.equal(expandCitations(literal), literal);
  assert.match(expandCitations('[Citation url="https://example.com"]**Exact** words[/Citation]'), /quote="Exact words"/);
});
test("real sanitized renderer retains crawlable citation links and escapes source metadata", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".citation-test-"));
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({ stdin: { contents: 'export { default } from "./src/Markdown";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, outfile, jsx: "automatic" });
    const { default: Markdown } = await import(pathToFileURL(outfile).href);
    const html = renderToStaticMarkup(createElement(Markdown, { content: citationTag(source, "Important **words**") }));
    assert.match(html, /class="citation-mark"/);
    assert.match(html, /Important <strong>words<\/strong>/);
    assert.match(html, /#:~:text=An%20exact%20quote%2C/);
    assert.doesNotMatch(html, /\[Citation|<script/);
    const unsafe = renderToStaticMarkup(createElement(Markdown, { content: '[Citation url="javascript:alert(1)"]Keep literal[/Citation]' }));
    assert.doesNotMatch(unsafe, /class="citation-mark"/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
