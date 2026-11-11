import type { EditorView } from "@codemirror/view";
import type { WriterEditor } from "./editor-handle";
import { writerCodeBlocks } from "./writer-code-blocks";
import { toggleWriterCode } from "./writer-code-folds";

export function writerEditorBridge(view: EditorView): WriterEditor {
  const editor = view.contentDOM as WriterEditor;
  Object.defineProperties(editor, {
    value: { get: () => view.state.doc.toString() },
    selectionStart: { get: () => view.state.selection.main.from },
    selectionEnd: { get: () => view.state.selection.main.to },
    scrollTop: {
      get: () => view.scrollDOM.scrollTop,
      set: (value: number) => {
        view.scrollDOM.scrollTop = value;
      },
    },
  });
  editor.setSelectionRange = (from, to) => {
    const length = view.state.doc.length;
    from = Math.max(0, Math.min(from, length));
    to = Math.max(from, Math.min(to, length));
    const effects = writerCodeBlocks(editor.value)
      .filter(
        (block) =>
          (from > block.from && from < block.to) ||
          (to > block.from && to < block.to),
      )
      .map((block) => toggleWriterCode.of({ from: block.from, open: true }));
    view.dispatch({
      selection: { anchor: from, head: to },
      effects,
      scrollIntoView: true,
    });
  };
  editor.caretCoordinates = () => {
    const rect = view.coordsAtPos(view.state.selection.main.head);
    const bounds = view.scrollDOM.getBoundingClientRect();
    return {
      x: rect?.left ?? bounds.left,
      y: rect?.top ?? bounds.top,
      height: rect ? rect.bottom - rect.top : 24,
      bounds,
    };
  };
  return editor;
}
