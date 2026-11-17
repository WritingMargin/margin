import type { Editor } from "@tiptap/react";
import type { WriterEditor } from "../editor-handle";
import { serializeDoc, posToOffset, offsetToPos } from "./serialize";
import { endComponentDrag, insertComponentAtSelection, insertCodeBlockAtSelection, insertDraftAtSelection, startComponentDrag } from "./insert-component";

/**
 * Adapt a Tiptap editor to the legacy `WriterEditor` contract used by search,
 * review, citations, templates, and offset-based insertion. Markdown offsets
 * are mapped to and from document positions through `serializeDoc`.
 */
export function richEditorBridge(
  editor: Editor,
  scrollEl: () => HTMLElement | null,
): WriterEditor {
  const snapshot = () => serializeDoc(editor.state.doc);

  const handle = {
    focus(options?: { preventScroll?: boolean }) {
      // Focus now (Tiptap's focus command waits a frame) so the next keystroke
      // lands in the pad, e.g. right after pressing Enter in the title.
      editor.view.focus();
      editor.commands.focus(undefined, { scrollIntoView: !options?.preventScroll });
    },
    get value() {
      return snapshot().markdown;
    },
    get selectionStart() {
      const { segments } = snapshot();
      return posToOffset(segments, editor.state.selection.from);
    },
    get selectionEnd() {
      const { segments } = snapshot();
      return posToOffset(segments, editor.state.selection.to);
    },
    setSelectionRange(start: number, end: number) {
      const { segments, markdown } = snapshot();
      const length = markdown.length;
      start = Math.max(0, Math.min(start, length));
      end = Math.max(start, Math.min(end, length));
      const from = offsetToPos(segments, start);
      const to = offsetToPos(segments, end);
      editor.commands.setTextSelection({ from, to });
      editor.view.focus();
    },
    get scrollTop() {
      return scrollEl()?.scrollTop ?? 0;
    },
    set scrollTop(value: number) {
      const el = scrollEl();
      if (el) el.scrollTop = value;
    },
    insertCodeBlock() { insertCodeBlockAtSelection(editor); },
    insertDraftComponent(kind: import("./draft-component").DraftComponentKind) { insertDraftAtSelection(editor, kind); },
    insertComponent(src: string) {
      insertComponentAtSelection(editor, src);
    },
    startComponentDrag(src: string) {
      startComponentDrag(editor, src);
    },
    endComponentDrag() {
      endComponentDrag(editor);
    },
    caretCoordinates() {
      const rect = editor.view.coordsAtPos(editor.state.selection.head);
      const bounds = (scrollEl() ?? editor.view.dom).getBoundingClientRect();
      return {
        x: rect?.left ?? bounds.left,
        y: rect?.top ?? bounds.top,
        height: rect ? rect.bottom - rect.top : 24,
        bounds,
      };
    },
  };

  return handle as unknown as WriterEditor;
}
