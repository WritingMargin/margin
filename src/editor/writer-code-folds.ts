import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { writerCodeBlocks, type WriterCodeBlock } from "./writer-code-blocks";

export const toggleWriterCode = StateEffect.define<{
  from: number;
  open: boolean;
}>();
class CodeLabel extends WidgetType {
  constructor(
    readonly block: WriterCodeBlock,
    readonly open: boolean,
  ) {
    super();
  }
  eq(other: CodeLabel) {
    return (
      this.block.from === other.block.from &&
      this.block.to === other.block.to &&
      this.block.label === other.block.label &&
      this.open === other.open
    );
  }
  toDOM(view: EditorView) {
    const row = document.createElement("span");
    row.className = "writer-code-label";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = this.open ? "Hide code" : this.block.label;
    button.className = "writer-code-toggle";
    button.setAttribute("aria-expanded", String(this.open));
    button.title = this.open ? "Collapse code" : "Double-click to edit code";
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      if (this.open || event.detail === 0) this.toggle(view);
    });
    button.addEventListener("dblclick", () => {
      if (!this.open) this.toggle(view);
    });
    row.append(button);
    return row;
  }
  toggle(view: EditorView) {
    view.dispatch({
      effects: toggleWriterCode.of({ from: this.block.from, open: !this.open }),
      selection: {
        anchor: this.open
          ? foldedCodeStart(view.state.doc.toString(), this.block.from)
          : this.block.body,
      },
      scrollIntoView: true,
    });
    view.focus();
  }
  ignoreEvent() {
    return true;
  }
}
function decorations(source: string, expanded: Set<number>) {
  return Decoration.set(
    writerCodeBlocks(source).map((block) =>
      expanded.has(block.from)
        ? Decoration.widget({
            widget: new CodeLabel(block, true),
            side: -1,
          }).range(block.from)
        : Decoration.replace({
            widget: new CodeLabel(block, false),
          }).range(foldedCodeStart(source, block.from), block.to),
    ),
  );
}
export const writerCodeFolds = StateField.define<{
  expanded: Set<number>;
  decorations: DecorationSet;
}>({
  create(state) {
    return {
      expanded: new Set(),
      decorations: decorations(state.doc.toString(), new Set()),
    };
  },
  update(value, transaction) {
    if (
      !transaction.docChanged &&
      !transaction.effects.some((effect) => effect.is(toggleWriterCode))
    )
      return value;
    const expanded = new Set(
      Array.from(value.expanded, (from) => transaction.changes.mapPos(from, 1)),
    );
    for (const effect of transaction.effects)
      if (effect.is(toggleWriterCode)) {
        if (effect.value.open) expanded.add(effect.value.from);
        else expanded.delete(effect.value.from);
      }
    return {
      expanded,
      decorations: decorations(transaction.newDoc.toString(), expanded),
    };
  },
  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).decorations),
  ],
});

// The placeholder joins the preceding text instead of taking a source-code row.
// Only the whitespace immediately before an embed is hidden; prose paragraph
// boundaries elsewhere and all saved source bytes remain untouched.
export function foldedCodeStart(source: string, from: number) {
  while (from > 0 && /[ \t\r\n]/.test(source[from - 1])) from--;
  return from;
}
