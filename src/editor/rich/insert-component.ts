import type { Editor } from "@tiptap/react";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { MARGIN_COMPONENT } from "./markdown";
import { componentBlocks } from "./markdown-components";

/** Build a component node from its Markdown source, labelled like the reader sees it. */
export function componentNode(editor: Editor, source: string): PMNode {
  // Examples come padded with blank lines for text insertion; a block doesn't need them.
  const src = source.replace(/^\s*\n/, "").replace(/\s+$/, "");
  const found = componentBlocks(src)[0];
  return editor.schema.nodes[MARGIN_COMPONENT].create({
    src,
    label: found?.label ?? "Component",
    kind: found?.kind ?? "",
  });
}

/** Top-level range [from, to) of the block holding the selection, if any. */
function currentBlock(editor: Editor) {
  const { $from } = editor.state.selection;
  if ($from.depth === 0) return null;
  return { from: $from.before(1), to: $from.after(1), node: $from.node(1) };
}

/**
 * Insert a component where the writer is: an empty line becomes the component,
 * otherwise it goes after the current block. The caret lands on a fresh line
 * below so writing can carry on.
 */
export function insertComponentAtSelection(editor: Editor, src: string) {
  const node = componentNode(editor, src);
  const paragraph = editor.schema.nodes.paragraph.create();
  const block = currentBlock(editor);
  const { tr } = editor.state;
  const replaceEmpty = block && block.node.isTextblock && block.node.content.size === 0;
  const from = block ? (replaceEmpty ? block.from : block.to) : tr.doc.content.size;
  const to = replaceEmpty && block ? block.to : from;
  tr.replaceWith(from, to, Fragment.from([node, paragraph]));
  tr.setSelection(TextSelection.create(tr.doc, from + node.nodeSize + 1));
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
}

type DraggingView = EditorView & { dragging: { slice: Slice; move: boolean } | null };

/**
 * Let ProseMirror treat a shelf card like one of its own drags: the drop line
 * shows where it will land and the drop inserts it there.
 */
export function startComponentDrag(editor: Editor, src: string) {
  const slice = new Slice(Fragment.from(componentNode(editor, src)), 0, 0);
  (editor.view as DraggingView).dragging = { slice, move: false };
}

/** Clear a shelf drag that ended outside the pad, so it can't leak into a later drop. */
export function endComponentDrag(editor: Editor) {
  const view = editor.view as DraggingView;
  if (view.dragging && !view.dragging.move) view.dragging = null;
}
