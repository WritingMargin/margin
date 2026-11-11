import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("search highlights server-matched words while preserving punctuation and escaping markup", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".renderer-test-"));
  try {
    const outfile = path.join(dir, "highlight.mjs");
    await build({ entryPoints: ["src/SearchHighlight.tsx"], outfile, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, jsx: "automatic" });
    const Highlight = (await import(pathToFileURL(outfile).href)).default;
    const render = (text: string, matches?: string[]) => renderToStaticMarkup(createElement(Highlight, { text, matches }));
    assert.equal(render("A telescope, then telescope.", ["telescope"]), 'A <mark class="search-highlight">telescope</mark>, then <mark class="search-highlight">telescope</mark>.');
    assert.equal(render("Café — 研究!", ["Café", "研究"]), '<mark class="search-highlight">Café</mark> — <mark class="search-highlight">研究</mark>!');
    assert.equal(render("Untouched text"), "Untouched text");
    assert.equal(render("cat category", ["cat"]), '<mark class="search-highlight">cat</mark> category');
    const unsafe = render('<img src=x onerror="alert(1)"> telescope', ["telescope"]);
    assert(!unsafe.includes("<img"));
    assert(unsafe.includes('&lt;img'));
    assert(unsafe.includes('<mark class="search-highlight">telescope</mark>'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
