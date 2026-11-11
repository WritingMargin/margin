import assert from "node:assert/strict";
import test from "node:test";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
expandContentTags,
tagAttributes,
taggedBlock,
} from "../shared/content-tags.ts";
import { blockExamples } from "./blocks/examples.ts";
import { widgetProperties } from "./blocks/layout.ts";
import { parseBlock } from "./blocks/schema.ts";

const parse = (source: string): any =>
  unified()
    .use(remarkParse)
    .use(remarkDirective)
    .parse(expandContentTags(source));

test("diagram, chart and scene tags preserve their payloads and use the validated block languages", () => {
  for (const example of blockExamples) {
    const node = parse(taggedBlock(example.language, example.source))
      .children[0];
    assert.equal(node.type, "code");
    assert.equal(node.lang, example.language);
    assert.equal(node.value, example.source);
    assert.equal(parseBlock(node.lang, node.value).kind, example.language);
  }
  const payload =
    'flowchart LR\nA[Font="Caveat"] --> B[Done]\n```\n[Image src="https://example.com/x.png"]';
  assert.equal(
    parse(`[Diagram]\n${payload}\n[/Diagram]`).children[0].value,
    payload,
  );
});

test("nested containers and direct diagram properties reach the existing layout validator", () => {
  const tree = parse(
    '[Columns ratio="wide-left"]\n[Column]\n## Context\n\n**Markdown** works.\n[/Column]\n[Column]\n[Diagram width="half" height="360" align="right" wrap="true"]\nflowchart LR\nA --> B\n[/Diagram]\n[/Column]\n[/Columns]',
  );
  const columns = tree.children[0];
  assert.equal(columns.name, "columns");
  assert.equal(columns.attributes.ratio, "wide-left");
  assert.equal(columns.children.length, 2);
  assert.equal(columns.children[0].children[0].type, "heading");
  const widget = columns.children[1].children[0];
  assert.equal(widget.name, "widget");
  assert.equal(widget.children[0].lang, "mermaid");
  assert.deepEqual(widgetProperties("widget", widget.attributes), {
    className: [
      "widget-frame",
      "widget-width-half",
      "widget-align-right",
      "widget-wrap-right",
    ],
    dataWidgetHeight: "360",
  });
});

test("media properties preserve quotes and brackets without creating extra tags or attributes", () => {
  const attributes = {
    src: "https://example.com/a.png?x=1&y=2",
    caption: 'A ] "quote"\\path\n[Video src="https://bad.example/x"]',
    alt: "<a & b>",
  };
  const node = parse(`[Image${tagAttributes(attributes)}]`).children[0];
  assert.equal(node.name, "image");
  assert.deepEqual(node.attributes, {
    ...attributes,
    caption: attributes.caption.replace(/\n/g, " "),
  });
  assert.equal(
    parse('[Video src="https://example.com/v.mp4" /]').children[0].name,
    "video",
  );
});

test("code examples and escaped, unknown, unclosed and mismatched tags remain literal", () => {
  for (const source of [
    "```md\n[Diagram]\nA --> B\n[/Diagram]\n```",
    '~~~\n[Image src="https://example.com/a"]\n~~~',
    '`[Image src="x"]`',
    '\\[Image src="x"]',
    '    [Image src="x"]',
    "[Unknown]\ntext\n[/Unknown]",
    '[Callout tone="tip"]\nText\n[/Columns]',
    "[Diagram]\nflowchart LR\nA-->B",
  ]) {
    assert.equal(expandContentTags(source), source);
  }
  assert.equal(
    expandContentTags(':::callout{tone="tip"}\nOld content\n:::'),
    ':::callout{tone="tip"}\nOld content\n:::',
  );
  assert.equal(
    parse('[cAlLoUt tone="warning"]\nNotice\n[/CALLOUT]').children[0].name,
    "callout",
  );
});


test("one-line model and Figma tags use the existing validated widget renderers", () => {
  const model = parse('[Model title="Gear" src="/assets/gear.glb" clip="/assets/spin.json" width="half" height="360"]').children[0];
  assert.equal(model.name, "widget");
  assert.equal(model.attributes.height, "360");
  const code = model.children[0];
  const block = parseBlock(code.lang, code.value);
  assert.equal(block.kind, "scene");
  if (block.kind === "scene") assert.equal(block.spec.objects[0].animationSrc, "/assets/spin.json");
  const figma = parse('[Figma title="A & B" url="https://www.figma.com/proto/abc?node-id=2-4&scaling=scale-down"]').children[0];
  assert.equal(figma.name, "linkcard");
  assert.deepEqual(figma.attributes, {title: "A & B", url: "https://www.figma.com/proto/abc?node-id=2-4&scaling=scale-down", mode: "figma"});
  const invalid = parse('[Model src="javascript:invalid"]').children[0];
  assert.throws(() => parseBlock("scene", invalid.value));
  const literal = '```text\n[Model src="example.glb"]\n```';
  assert.equal(expandContentTags(literal), literal);
});
