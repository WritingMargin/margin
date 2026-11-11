import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tabOptions,tabsExample,tabsMarkdown } from "../shared/tabs.ts";
import { getCompletions } from "./editor-completions.ts";

test("content tabs render sanitized Markdown, independent accessible groups, and nested panels", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".tabs-test-"));
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({
      stdin: {
        contents: 'export { default as Markdown } from "./src/Markdown";',
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      loader: { ".css": "empty" },
      outfile,
      jsx: "automatic",
    });
    const { Markdown } = await import(pathToFileURL(outfile).href);
    const render = (content: string) =>
      renderToStaticMarkup(createElement(Markdown, { content }));
    const html = render(
      tabsExample("horizontal") + "\n\n" + tabsExample("vertical"),
    );
    assert.equal((html.match(/role="tablist"/g) || []).length, 2);
    assert.match(html, /aria-orientation="horizontal"/);
    assert.match(html, /aria-orientation="vertical"/);
    assert.equal((html.match(/role="tab"/g) || []).length, 6);
    assert.equal((html.match(/aria-selected="true"/g) || []).length, 2);
    assert.equal((html.match(/hidden=""/g) || []).length, 4);
    assert.match(html, /<strong>Markdown<\/strong>/);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const control of html.matchAll(/aria-controls="([^"]+)"/g))
      assert.ok(ids.includes(control[1]));
    const custom = render(
      tabsMarkdown(
        "Custom",
        tabOptions({
          orientation: "vertical",
          variant: "pills",
          spacing: "compact",
          initial: "2",
          accent: "#ffeedd",
          radius: "12",
        }),
        [
          { title: "One", content: "First content" },
          { title: "Two", content: "**Second content**" },
        ],
      ),
    );
    assert.match(custom, /content-tabs-pills content-tabs-compact/);
    assert.match(
      custom,
      /--tabs-accent:#ffeedd;--tabs-ink:#151515;--tabs-radius:12px/,
    );
    assert.match(custom, /aria-selected="true"[^>]*>Two</);
    assert.match(custom, /<strong>Second content<\/strong>/);
    assert.match(custom, /First content/); // Inactive panels remain crawlable in server HTML.
    const nested = render(
      '[Tabs]\n[Tab title="Outer"]\n' +
        tabsExample("vertical") +
        "\n[/Tab]\n[/Tabs]",
    );
    assert.equal((nested.match(/role="tablist"/g) || []).length, 2);
    const malicious = render(
      '[Tabs orientation="position:fixed" onclick="alert(1)"]\n[Tab title="<img onerror=evil>" style="position:fixed"]\n**Safe**\n<script>alert(1)</script>\n[/Tab]\n[/Tabs]',
    );
    assert.match(malicious, /aria-orientation="horizontal"/);
    assert.match(malicious, /&lt;img onerror=evil&gt;/);
    assert.doesNotMatch(malicious, /<script|onclick=|style="position/);
    assert.match(render("```md\n" + tabsExample() + "\n```"), /\[Tabs/);
    assert.doesNotMatch(
      render("```md\n" + tabsExample() + "\n```"),
      /role="tablist"/,
    );
    assert.match(
      render("[Tabs]\nText without panels\n[/Tabs]"),
      /Text without panels/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("editor suggests tab presets, orientation properties and closing tags", () => {
  const query = "/tabs";
  assert.ok(
    getCompletions(query, query.length)?.items.some(
      (item) => item.id === "tabs",
    ),
  );
  const vertical = "/vertical";
  assert.ok(
    getCompletions(vertical, vertical.length)?.items.some(
      (item) => item.id === "vertical-tabs",
    ),
  );
  const property = '[Tabs orientation="v';
  assert.deepEqual(
    getCompletions(property, property.length)?.items.map((item) => item.text),
    ['orientation="vertical"'],
  );
  assert.ok(
    getCompletions("[/Ta", 4)?.items.some((item) => item.text === "[/Tabs]"),
  );
});

test("tab options reject arbitrary CSS and invalid settings", () => {
  assert.deepEqual(
    tabOptions({
      orientation: "diagonal",
      variant: "evil",
      spacing: "huge",
      initial: "-1",
      accent: "red;position:fixed",
      radius: "9999",
    }),
    {
      orientation: "horizontal",
      variant: "underline",
      spacing: "comfortable",
      initial: 1,
    },
  );
  assert.deepEqual(tabOptions({ radius: 0, initial: 100, variant: "boxed" }), {
    orientation: "horizontal",
    variant: "boxed",
    spacing: "comfortable",
    initial: 100,
    radius: 0,
  });
  const source = tabsMarkdown('A "quoted" group', tabOptions({}), [
    { title: 'One "title"', content: "**Safe**" },
  ]);
  assert.match(source, /title="A \\"quoted\\" group"/);
});
