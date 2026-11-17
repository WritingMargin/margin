import test from "node:test";
import assert from "node:assert/strict";
import { Node, getSchema, type Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  AllSelection,
  NodeSelection,
  EditorState,
  Selection,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";
import {
  insertCodeBlockAtSelection,
  insertDraftAtSelection,
} from "./editor/rich/insert-component";
import {
  draftComponentSource,
  parseDraftComponent,
} from "./editor/rich/draft-component";
import { importMarginMarkdown, MARGIN_COMPONENT } from "./editor/rich/markdown";
import { serializeDoc } from "./editor/rich/serialize";
const schema = getSchema([
  StarterKit,
  Node.create({
    name: MARGIN_COMPONENT,
    group: "block",
    atom: true,
    addAttributes: () => ({
      src: { default: "" },
      label: { default: "" },
      kind: { default: "" },
    }),
  }),
]);
function fixture(markdown: string, from: number, to = from) {
  const doc = schema.nodeFromJSON(importMarginMarkdown(markdown));
  let state = EditorState.create({
    doc,
    selection:
      from === 0 ? Selection.atStart(doc) : TextSelection.create(doc, from, to),
  });
  return {
    schema,
    get state() {
      return state;
    },
    view: {
      dispatch(tr: Transaction) {
        state = state.apply(tr);
      },
    },
    commands: { focus() {} },
  } as unknown as Editor;
}
test("toolbar code insertion keeps prose and puts the caret inside editable code", () => {
  const editor = fixture("Before\n\nAfter", 3);
  insertCodeBlockAtSelection(editor);
  assert.deepEqual(
    editor.state.doc.toJSON().content.map((x: { type: string }) => x.type),
    ["paragraph", "codeBlock", "paragraph", "paragraph"],
  );
  assert.equal(editor.state.selection.$from.parent.type.name, "codeBlock");
  assert.match(
    serializeDoc(editor.state.doc).markdown,
    /Before\n\n```\n\n```\n\nAfter/,
  );
});
test("selected words become code without losing surrounding text", () => {
  const editor = fixture("Before selected after", 8, 16);
  insertCodeBlockAtSelection(editor);
  assert.equal(editor.state.selection.$from.parent.type.name, "codeBlock");
  assert.equal(editor.state.selection.$from.parent.textContent, "selected");
  assert.equal(editor.state.doc.textContent, "Before selected after");
});
test("citation insertion retains selected formatting and survives Markdown reload", () => {
  const editor = fixture("Before **selected** after", 8, 16);
  insertDraftAtSelection(editor, "citation");
  const markdown = serializeDoc(editor.state.doc).markdown;
  const restored = schema.nodeFromJSON(importMarginMarkdown(markdown));
  const nodes: string[] = [];
  restored.forEach((node) => {
    if (node.type.name === MARGIN_COMPONENT) nodes.push(node.attrs.src);
  });
  assert.equal(nodes.length, 1);
  assert.deepEqual(parseDraftComponent(nodes[0]), {
    kind: "citation",
    text: "**selected**",
  });
  assert.match(markdown, /Before/);
  assert.match(markdown, /after/);
});
test("unfinished picker contents cannot terminate their HTML comment", () => {
  const value = 'quote -->\n[Image src="x"]';
  const source = draftComponentSource("citation", value);
  assert.equal(source.split("-->").length, 2);
  assert.deepEqual(parseDraftComponent(source), {
    kind: "citation",
    text: value,
  });
});
test("completed standalone citations remain rendered components on reload", () => {
  const source =
    '[Citation url="https://example.com" title="Source"]Selected text[/Citation]';
  const editor = fixture(source, 0);
  assert.equal(editor.state.doc.firstChild?.type.name, MARGIN_COMPONENT);
  assert.equal(serializeDoc(editor.state.doc).markdown, source);
});

test("whole-paragraph code selection keeps the caret in code", () => {
  const editor = fixture("selected", 1, 9);
  insertCodeBlockAtSelection(editor);
  assert.equal(editor.state.selection.$from.parent.type.name, "codeBlock");
  assert.equal(editor.state.doc.textContent, "selected");
});
test("multi-paragraph code selection preserves line breaks", () => {
  const editor = fixture("one\n\ntwo", 1, 9);
  insertCodeBlockAtSelection(editor);
  assert.equal(editor.state.selection.$from.parent.type.name, "codeBlock");
  assert.equal(editor.state.doc.firstChild?.textContent, "one\ntwo");
});

test("code insertion accepts an empty document selection", () => {
  const editor = fixture("", 0);
  editor.view.dispatch(
    editor.state.tr.setSelection(new AllSelection(editor.state.doc)),
  );
  insertCodeBlockAtSelection(editor);
  assert.equal(editor.state.selection.$from.parent.type.name, "codeBlock");
});

test("an empty code block survives saving and reloading", () => {
  const editor = fixture("", 0);
  insertCodeBlockAtSelection(editor);
  const saved = serializeDoc(editor.state.doc).markdown;
  const restored = schema.nodeFromJSON(importMarginMarkdown(saved));
  assert.equal(restored.firstChild?.type.name, "codeBlock");
  assert.equal(restored.firstChild?.textContent, "");
});

test("code samples containing insertion syntax stay code on reload", () => {
  const source = "```html\n" + draftComponentSource("media") + "\n```";
  const restored = schema.nodeFromJSON(importMarginMarkdown(source));
  assert.equal(restored.childCount, 1);
  assert.equal(restored.firstChild?.type.name, "codeBlock");
});
test("toolbar insertion never replaces a selected component", () => {
  const editor = fixture("[Divider]", 0);
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
  insertCodeBlockAtSelection(editor);
  assert.equal(editor.state.doc.firstChild?.type.name, MARGIN_COMPONENT);
  assert.equal(editor.state.doc.firstChild?.attrs.src, "[Divider]");
});
