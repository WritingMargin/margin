import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("contents links target rendered headings, including duplicates and formatted text", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".toc-test-"));
  try {
    const outfile = path.join(dir, "markdown.mjs");
    await build({ stdin: { contents: 'export { default } from "./src/Markdown";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty", ".svg": "dataurl" }, outfile, jsx: "automatic", define: { "import.meta.env": JSON.stringify({ BASE_URL: "/" }) } });
    const { default: Markdown } = await import(pathToFileURL(outfile).href);
    const content = "Intro\n\n## A **bold** idea\n\nText.\n\n### 日本語 & more\n\n## A **bold** idea\n\n```md\n## Not a heading\n```";
    for (const tableOfContents of ["top", "left", "right"]) {
      const html = renderToStaticMarkup(createElement(Markdown, { content, tableOfContents }));
      assert.match(html, /aria-label="Table of contents"/);
      assert.ok(html.includes(`article-toc-${tableOfContents}`));
      assert.equal([...html.matchAll(/class="section-permalink"/g)].length, 3);
      assert.match(html, /<h2 id="section-a-bold-idea-2">A <strong>bold<\/strong> idea<a /);
      assert.match(html, /<a href="#section-a-bold-idea"[^>]*>A bold idea<\/a>/);
      assert.match(html, /toc-depth-1/);
      assert.match(html, /日本語 &amp; more/);
    }
    const designed = renderToStaticMarkup(createElement(Markdown, { content, tableOfContents: "right", contentsDesign: { title: "Explore <this>", style: "filled", numbered: true, maxDepth: 2, width: 260, radius: 0, sticky: false, background: "#eef2ff" } }));
    assert.match(designed, /Explore &lt;this&gt;/);
    assert.match(designed, /data-style="filled"/);
    assert.match(designed, /data-numbered="true"/);
    assert.match(designed, /data-sticky="false"/);
    assert.match(designed, /--toc-width:260px/);
    assert.equal([...designed.matchAll(/class="toc-depth-/g)].length, 2);
    assert.doesNotMatch(designed, /<li class="toc-depth-[0-9]+"><a href="#section-日本語-more"/);
    assert.match(designed, /id="article-section-2"/);
    assert.match(designed, /href="#section-a-bold-idea-2"/);
    const noTitle = renderToStaticMarkup(createElement(Markdown, { content: "## First", tableOfContents: "top", contentsDesign: { title: "" } }));
    assert.doesNotMatch(noTitle, /<strong>/);
    const noMatch = renderToStaticMarkup(createElement(Markdown, { content: "## First", tableOfContents: "top", contentsDesign: { maxDepth: 1 } }));
    assert.doesNotMatch(noMatch, /article-toc-layout/);
    assert.equal(noMatch, renderToStaticMarkup(createElement(Markdown, { content: "## First", tableOfContents: "off" })));
    for (const props of [{ content, tableOfContents: "off" }, { content: "No headings", tableOfContents: "top" }]) {
      assert.doesNotMatch(renderToStaticMarkup(createElement(Markdown, props)), /article-toc-layout/);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
