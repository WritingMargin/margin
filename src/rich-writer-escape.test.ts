import test from "node:test";
import assert from "node:assert/strict";
import { Node, getSchema, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { importMarginMarkdownWithSources, MARGIN_COMPONENT } from "./editor/rich/markdown";
import { offsetToPos, posToOffset, serializeDoc } from "./editor/rich/serialize";

const schema = getSchema([
  StarterKit.configure({ trailingNode: false }),
  Node.create({
    name: MARGIN_COMPONENT,
    group: "block",
    atom: true,
    addAttributes: () => ({ src: { default: "" }, label: { default: "" }, kind: { default: "" } }),
  }),
]);

const doc = (content: JSONContent[]) => schema.nodeFromJSON({ type: "doc", content });
const paragraph = (text: string, marks?: JSONContent["marks"]) =>
  doc([{ type: "paragraph", content: [{ type: "text", text, marks }] }]);
const reread = (markdown: string) => doc(importMarginMarkdownWithSources(markdown).doc.content ?? []);

/** Same parser setup as the reader, which also understands directives. */
const reader = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);
function readerText(markdown: string) {
  let text = "";
  let other = false;
  (function walk(node: { type: string; value?: string; children?: unknown[] }) {
    if (node.type === "text") text += node.value;
    // A bare URL becoming a link is fine: the text is unchanged.
    else if (!["root", "paragraph", "link"].includes(node.type)) other = true;
    (node.children as (typeof node)[] | undefined)?.forEach(walk);
  })(reader.parse(markdown) as never);
  return { text, other };
}

function assertSameText(text: string) {
  const markdown = serializeDoc(paragraph(text)).markdown;
  const back = reread(markdown);
  const where = `${JSON.stringify(text)} was saved as ${JSON.stringify(markdown)}`;
  assert.equal(back.childCount, 1, where);
  assert.equal(back.firstChild!.type.name, "paragraph", where);
  assert.equal(back.textContent, text, where);
  assert.deepEqual(readerText(markdown), { text, other: false }, `reader: ${where}`);
}

const tricky = [
  "2 * 3 = 6", "snake_case_name stays clean", "_leading and trailing_", "**not bold**",
  "`not code`", '[Image src="x"]', "[link](https://x.test)", "~~not struck~~",
  "# not a heading", "## also not", "- not a list", "+ not a list", "* not a list",
  "1. not a list", "2) not a list", "> not a quote", "---", "===", "___",
  "::video{src=x}", ":::callout", "<b>not html</b>", "<!-- not a comment -->",
  "&amp; stays literal", "&#169; too", "C:\\path\\to\\file", "ends with a backslash \\",
  "a \\* b", "| a | b |", "![x](y)", "meet at 10:30", "re:Invent and Note:this",
  "Price \\* 2 is the rule.", "üñï_cødé and émoji 🙂",
];

test("typed punctuation is saved so it reads back as the same text", () => {
  for (const text of tricky) assertSameText(text);
});

test("random punctuation-heavy text round-trips for the editor and the reader", () => {
  const alphabet = "*_`[]~#-+>=:<&;!\\()|.1ab ";
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
  for (let n = 0; n < 500; n++) {
    let text = "";
    for (let i = 1 + (next() % 12); i > 0; i--) text += alphabet[next() % alphabet.length];
    text = text.trim();
    if (text) assertSameText(text);
  }
});

test("only the characters that need it are escaped", () => {
  const save = (text: string) => serializeDoc(paragraph(text)).markdown;
  assert.equal(save("snake_case and 1.5 and #hashtag"), "snake_case and 1.5 and #hashtag");
  assert.equal(save("2 * 3"), "2 \\* 3");
  assert.equal(save("# title"), "\\# title");
  assert.equal(save("meet at 10:30"), "meet at 10\\:30");
});

test("cursor positions stay exact around added backslashes", () => {
  const text = "*a *b* [c] _d_ # 10:30";
  const { markdown, segments } = serializeDoc(paragraph(text));
  for (let i = 0; i < text.length; i++) {
    const offset = posToOffset(segments, 1 + i);
    // Before an escaped character the caret sits just before its backslash.
    const char = markdown[offset] === "\\" ? markdown[offset + 1] : markdown[offset];
    assert.equal(char, text[i], `char ${i} of ${JSON.stringify(markdown)}`);
    assert.equal(offsetToPos(segments, offset), 1 + i);
  }
  // Text found by searching the saved Markdown maps back to the right place.
  const found = markdown.indexOf("10");
  assert.equal(offsetToPos(segments, found), 1 + text.indexOf("10"));
});

test("marks keep their text: bold with *, code with backticks, links with spaces", () => {
  const cases: [string, JSONContent["marks"]][] = [
    ["a*b", [{ type: "bold" }]],
    ["use `x` here", [{ type: "code" }]],
    ["`edge`", [{ type: "code" }]],
    ["docs", [{ type: "link", attrs: { href: "https://x.test/a b(1)", title: 'say "hi"' } }]],
  ];
  for (const [text, marks] of cases) {
    const markdown = serializeDoc(paragraph(text, marks)).markdown;
    const back = reread(markdown).firstChild!.firstChild!;
    assert.equal(back.text, text, markdown);
    for (const mark of marks ?? []) {
      const found = back.marks.find((m) => m.type.name === mark.type);
      assert.ok(found, `${mark.type} kept in ${markdown}`);
      for (const [key, value] of Object.entries(mark.attrs ?? {})) assert.equal(found.attrs[key], value, markdown);
    }
  }
});

test("headings and list items escape only where a line could change meaning", () => {
  const heading = doc([{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "# 1. Intro" }] }]);
  assert.equal(reread(serializeDoc(heading).markdown).firstChild!.textContent, "# 1. Intro");
  const list = doc([{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "- nested?" }] }] }] }]);
  const back = reread(serializeDoc(list).markdown);
  assert.equal(back.firstChild!.type.name, "bulletList");
  assert.equal(back.textContent, "- nested?");
});
