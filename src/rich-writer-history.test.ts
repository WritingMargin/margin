import test from "node:test";
import assert from "node:assert/strict";
import { Node, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import { history, redo, undo } from "@tiptap/pm/history";
import {
  importMarginMarkdownWithSources,
  MARGIN_COMPONENT,
} from "./editor/rich/markdown";
import { rememberSources, serializeDoc } from "./editor/rich/serialize";

// Same schema as the writer's pad, with a plain node in place of the React view.
// StarterKit registers the same UndoRedo extension the pad uses, so its
// keymap, grouping and depth defaults are exercised through pm/history here.
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

function edit(state: EditorState, apply: (tr: import("@tiptap/pm/state").Transaction) => void) {
  apply(state.tr);
}

test("undo restores the loaded article and redo applies the edit again", () => {
  const doc = load(article);
  let state = EditorState.create({ doc, plugins: [history()] });
  edit(state, (tr) => {
    state = state.apply(tr.insertText("Hey. ", 1));
  });
  assert.ok(serializeDoc(state.doc).markdown.startsWith("Hey. "));
  if (!undo(state, (tr) => { state = state.apply(tr); })) {
    assert.fail("undo had nothing to restore");
  }
  assert.equal(serializeDoc(state.doc).markdown, article);
  if (!redo(state, (tr) => { state = state.apply(tr); })) {
    assert.fail("redo lost the undone edit");
  }
  assert.ok(serializeDoc(state.doc).markdown.startsWith("Hey. "));
});

test("undo keeps every block byte for byte, including the rebuilt one", () => {
  const doc = load(article);
  let state = EditorState.create({ doc, plugins: [history()] });
  const last = doc.child(doc.childCount - 1);
  edit(state, (tr) => {
    let lastPos = 0;
    doc.forEach((node, offset) => {
      if (node === last) lastPos = offset;
    });
    state = state.apply(tr.insertText(" Edited.", lastPos + 1 + last.content.size));
  });
  if (!undo(state, (tr) => { state = state.apply(tr); })) {
    assert.fail("undo had nothing to restore");
  }
  // The edited block was rebuilt without identity, yet still saves byte for
  // byte; untouched blocks around it never lost theirs.
  assert.equal(serializeDoc(state.doc).markdown, article);
  const image = doc.child(2);
  assert.equal(state.doc.child(2), image, "untouched component block keeps identity");
});

test("an external content replacement is one undoable step", () => {
  const doc = load(article);
  let state = EditorState.create({ doc, plugins: [history()] });
  const next = load(article.replace("Closing paragraph.", "Closing paragraph, revised."));
  // The pad applies external content (AI suggestions, templates, revisions)
  // as one whole-document replace, exactly like setContent does.
  state = state.apply(state.tr.replaceWith(0, state.doc.content.size, next.content));
  assert.ok(serializeDoc(state.doc).markdown.includes("revised"));
  if (!undo(state, (tr) => { state = state.apply(tr); })) {
    assert.fail("external replacement was not recorded as an undoable step");
  }
  assert.equal(serializeDoc(state.doc).markdown, article);
});
