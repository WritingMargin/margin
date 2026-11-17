import test from "node:test";
import assert from "node:assert/strict";
import { componentBlocks } from "./editor/rich/markdown-components";
import { importMarginMarkdown, exportMarginMarkdown } from "./editor/rich/markdown";

test("detects leaf, container, raw, and fenced components", () => {
  const source = [
    "Intro",
    "",
    '[Image src="https://x/y.jpg" caption="A photo"]',
    "",
    '[Callout tone="note"]',
    "Hello",
    "[/Callout]",
    "",
    '[Chart]',
    '{"data":[1,2]}',
    "[/Chart]",
    "",
    "```mermaid",
    "graph TD; A-->B",
    "```",
    "",
    "After",
  ].join("\n");
  const blocks = componentBlocks(source);
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["Image", "Callout", "Chart", "mermaid"],
  );
  assert.equal(blocks[0].src, '[Image src="https://x/y.jpg" caption="A photo"]');
  assert.equal(
    blocks[2].src,
    '[Chart]\n{"data":[1,2]}\n[/Chart]',
  );
  assert.equal(
    blocks[3].src,
    "```mermaid\ngraph TD; A-->B\n```",
  );
});

test("ordinary prose round-trips without component interference", () => {
  const source = [
    "## Heading",
    "",
    "A paragraph with *emphasis*, **strong**, `code`, and a [link](https://x.test).",
    "",
    "- one",
    "- two",
    "",
    "> A quote",
    "",
    "1. first",
    "2. second",
    "",
  ].join("\n");
  const doc = importMarginMarkdown(source);
  const out = exportMarginMarkdown(doc);
  // Normalization: soft wraps are joined and emphasis uses `_` on export.
  assert.match(out, /## Heading/);
  assert.match(out, /_emphasis_/);
  assert.match(out, /\*\*strong\*\*/);
  assert.match(out, /- one/);
  assert.match(out, /> A quote/);
  assert.match(out, /1\. first/);
});

test("components round-trip byte-for-byte while prose normalizes", () => {
  const source =
    "Before\n\n[Image src=\"https://x/y.jpg\"]\n\n```js\nconst x = 1;\n```\n\nAfter\n";
  const doc = importMarginMarkdown(source);
  const out = exportMarginMarkdown(doc);
  assert.ok(out.includes('[Image src="https://x/y.jpg"]'));
  assert.ok(out.includes("```js\nconst x = 1;\n```"));
  assert.ok(out.includes("Before"));
  assert.ok(out.includes("After"));
});

test("unsupported prose falls back to an opaque component", () => {
  const source = [
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "After",
  ].join("\n");
  const doc = importMarginMarkdown(source);
  const types = (doc.content ?? []).map((n) => n.type);
  assert.ok(types.includes("marginComponent"));
  const out = exportMarginMarkdown(doc);
  assert.ok(out.includes("| a | b |"));
  assert.ok(out.includes("After"));
});

test("unfinished tags stay editable prose", () => {
  assert.equal(componentBlocks("[Chart]\n{}").length, 0);
  assert.equal(componentBlocks("[Callout tone=\"note\"]\nno close").length, 0);
});
