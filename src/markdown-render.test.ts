import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { blockExamples } from "./blocks/examples";
import { renderToStaticMarkup } from "react-dom/server";

test("article rendering preserves nested layouts, fonts, media, and sanitization", async () => {
  const directory = await mkdtemp(path.join(process.cwd(), ".renderer-test-"));
  try {
    const outfile = path.join(directory, "markdown.mjs");
    await build({
      stdin: {
        contents: 'export { default } from "./src/Markdown";',
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
    const { default: Markdown } = await import(pathToFileURL(outfile).href);
    const render = (content: string) =>
      renderToStaticMarkup(createElement(Markdown, { content }));
    const layout = render(`[Columns columns="2"]
[Column]
[Font="Caveat"]A handwritten **explanation**[/Font]
[/Column]
[Column]
[Video src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" width="80%" ratio="16:9" caption="A walkthrough"]
[/Column]
[/Columns]`);
    assert.match(layout, /widget-grid/);
    assert.match(layout, /font-family:[^"]*Caveat/);
    assert.match(layout, /<strong>explanation<\/strong>/);
    assert.match(layout, /--video-width:80%/);
    assert.match(layout, /youtube-nocookie.com\/embed\/dQw4w9WgXcQ/);
    assert.match(layout, /<figcaption>A walkthrough<\/figcaption>/);

    const tabs =
      render(`[Tabs title="Details" orientation="vertical" initial="2" accent="#123456"]
[Tab title="First"]
First panel
[/Tab]
[Tab title="Second"]
Second panel
[/Tab]
[/Tabs]`);
    assert.match(tabs, /aria-orientation="vertical"/);
    assert.match(tabs, /aria-selected="true"[^>]*>Second<\/button>/);
    assert.match(tabs, /--tabs-accent:#123456/);
    assert.match(tabs, /Second panel/);

    const carousel = render(`[Carousel title="A visual story"]
[Image src="https://example.com/first.png" alt="First image"]
[Image src="https://example.com/second.png" alt="Second image"]
[/Carousel]`);
    assert.match(carousel, /aria-roledescription="carousel"/);
    assert.match(carousel, /aria-label="1 of 2"/);
    assert.match(carousel, /aria-label="Next image"/);
    assert.match(carousel, /alt="Second image"/);

    const social = render(
      'https://x.com/jack/status/20?s=20\n\n[Social url="https://www.instagram.com/p/ABC123/" title="A useful illustration"]\n\nhttps://www.linkedin.com/feed/update/urn:li:activity:123456789/',
    );
    assert.equal((social.match(/class="social-post-card"/g) || []).length, 3);
    assert.match(social, /A useful illustration/);
    assert.match(social, /Load embed/);
    assert.doesNotMatch(social, /<iframe|<script|platform.twitter.com/);
    const plain = render(
      "An inline https://x.com/jack/status/20 link.\n\n`https://x.com/jack/status/20`\n\n```text\nhttps://x.com/jack/status/20\n```",
    );
    assert.doesNotMatch(plain, /social-post-card/);
    const code = render('```ts\nconst count: number = 42;\n```\n\nInline `count`.');
    assert.match(code, /TypeScript/);
    assert.match(code, /hljs-keyword/);
    assert.match(code, /aria-label="Copy code"/);
    assert.match(code, /Inline <code>count<\/code>/);
    assert.match(code, /class="code-block"/);
    const unwrapped = render('```ts nowrap\nconst veryLongLine = 42;\n```');
    assert.match(unwrapped, /class="code-block code-block-nowrap"/);
    assert.match(render('```ts title=nowrap\nconst x = 1;\n```'), /class="code-block"/);
    const unsafeCode = render('```html\n<script>alert("hello")</script>\n```');
    assert.doesNotMatch(unsafeCode, /<script>/);
    assert.match(unsafeCode, /&lt;/);
    const unknownCode = render('```futurelang\n<value>\n```');
    assert.match(unknownCode, /futurelang/);
    assert.match(unknownCode, /&lt;value&gt;/);
    const illustrationSource = blockExamples.find(example => example.language === "illustration")!.source;
    const illustration = render(`[Illustration]\n${illustrationSource}\n[/Illustration]`);
    assert.match(illustration, /Expand illustration/);
    assert.match(illustration, /aria-label="1\. Outer layer"/);
    assert.match(illustration, /The core sits inside the outer layer/);
    assert.match(illustration, /<svg/);
    assert.match(illustration, /<dialog/);
    const invalidIllustration = render('```illustration\n{"title":"Invalid","script":"alert(1)"}\n```');
    assert.match(invalidIllustration, /block-error/);
    assert.doesNotMatch(invalidIllustration, /<svg|<script/);

    const diagram = render('```mermaid\ngraph LR\n  A-->B\n```');
    assert.doesNotMatch(diagram, /class="code-block"/);
    assert.doesNotMatch(
      render('[Social url="javascript:alert(1)" title="Bad"]'),
      /iframe|href="javascript/,
    );

    const unsafe = render(
      '<script>alert(1)</script>\n\n[Image src="javascript:alert(1)"]\n\n[Font="unknown"]Still readable[/Font]',
    );
    assert.doesNotMatch(unsafe, /<script|src="javascript:|onerror=/);
    assert.match(unsafe, /Still readable/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
