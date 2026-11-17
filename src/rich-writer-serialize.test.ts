import test from "node:test";
import assert from "node:assert/strict";
import { Node, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import {
  importMarginMarkdown,
  importMarginMarkdownWithSources,
  MARGIN_COMPONENT,
} from "./editor/rich/markdown";
import {
  offsetToPos,
  rememberSources,
  serializeDoc,
} from "./editor/rich/serialize";

// Same schema as the writer, with a plain node in place of the React view.
const schema = getSchema([
  StarterKit.configure({ trailingNode: false }),
  Node.create({
    name: MARGIN_COMPONENT,
    group: "block",
    atom: true,
    addAttributes: () => ({
      src: { default: "" },
      label: { default: "Component" },
      kind: { default: "" },
    }),
  }),
]);

function load(source: string) {
  const imported = importMarginMarkdownWithSources(source);
  const doc = schema.nodeFromJSON(imported.doc);
  rememberSources(doc, imported);
  return doc;
}

const article = [
  "Intro with *emphasis* and __strong__ text that",
  "wraps onto a second line.",
  "",
  "* first",
  "* second",
  "",
  '[Image src="https://x/y.jpg" caption="A photo"]',
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "Closing paragraph.",
  "",
].join("\n");

test("an untouched article serializes back byte for byte", () => {
  assert.equal(serializeDoc(load(article)).markdown, article);
});

test("editing one block only reformats that block", () => {
  const doc = load(article);
  const last = doc.child(doc.childCount - 1);
  let lastPos = 0;
  doc.forEach((node, offset) => {
    if (node === last) lastPos = offset;
  });
  const state = EditorState.create({ doc });
  const edited = state.apply(
    state.tr.insertText(" Edited.", lastPos + 1 + last.content.size),
  ).doc;
  // Untouched siblings keep their identity, so their source is reused.
  assert.equal(edited.child(0), doc.child(0));
  assert.equal(
    serializeDoc(edited).markdown,
    article.replace("Closing paragraph.", "Closing paragraph. Edited."),
  );
});

test("editing a block with alternate syntax normalizes just that block", () => {
  const doc = load(article);
  const state = EditorState.create({ doc });
  const edited = state.apply(state.tr.insertText("Hey. ", 1)).doc;
  const out = serializeDoc(edited).markdown;
  assert.ok(out.startsWith("Hey. Intro with _emphasis_ and **strong** text that wraps"));
  assert.ok(out.includes("* first\n* second"), "untouched list keeps `*` markers");
});

test("offsets stay exact inside blocks kept verbatim", () => {
  const doc = load(article);
  const { markdown, segments } = serializeDoc(doc);
  for (const word of ["second line", "Closing", "strong"]) {
    const offset = markdown.indexOf(word);
    const from = offsetToPos(segments, offset);
    const to = offsetToPos(segments, offset + word.length);
    assert.equal(doc.textBetween(from, to), word);
  }
});

test("one unsupported block no longer locks the prose around it", () => {
  const source = [
    "Before the table.",
    "",
    "| a | b |",
    "| - | - |",
    "| 1 | 2 |",
    "",
    "After with ![a chart](https://x/c.png) inline.",
    "",
    "Still editable.",
  ].join("\n");
  const content = importMarginMarkdown(source).content ?? [];
  assert.deepEqual(
    content.map((n) => (n.type === MARGIN_COMPONENT ? n.attrs?.label : n.type)),
    ["paragraph", "Table", "Image", "paragraph"],
  );
  assert.equal(content[1].attrs?.kind, "markdown");
  assert.equal(content[1].attrs?.src, "| a | b |\n| - | - |\n| 1 | 2 |");
});

test("external reloads re-arm byte-for-byte saving", () => {
  const changed = article.replace("Intro", "New intro");
  assert.equal(serializeDoc(load(changed)).markdown, changed);
});

test("documents with no blocks serialize to an empty string", () => {
  assert.equal(serializeDoc(load("")).markdown, "");
});
