import { memo, useCallback, type MouseEvent } from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import Markdown from "../../Markdown";
import { openComponentSettings } from "./component-edit";
import InlineInsert from "./InlineInsert";
import { draftComponentSource, parseDraftComponent } from "./draft-component";
import { componentNode } from "./insert-component";
import { importMarginMarkdown } from "./markdown";
import { Fragment } from "@tiptap/pm/model";
import { Settings2 } from "lucide-react";

const MarginPreview = memo(function MarginPreview({ src }: { src: string }) {
  return <Markdown content={src} />;
});

/**
 * A component inside the writer renders exactly like the reader sees it and
 * stays interactive, so tabs, galleries and players work in place. The edit
 * button opens its compact settings without hijacking the component itself.
 */
export default function MarginComponentView({ node, getPos, selected, editor, updateAttributes }: ReactNodeViewProps) {
  const { src, label } = node.attrs as { src: string; label: string; kind: string };
  const kind = String(node.attrs.kind || "");

  const openSettings = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const pos = getPos();
      if (typeof pos !== "number") return;
      editor.commands.setNodeSelection(pos);
      openComponentSettings({ pos });
    },
    [getPos, editor],
  );

  const draft = parseDraftComponent(src);
  function finish(source: string) {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const next = componentNode(editor, source);
    editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, next));
    editor.commands.focus();
  }
  function cancel() {
    const pos = getPos();
    if (typeof pos !== "number" || !draft) return;
    // Cancelling a citation restores the selected words instead of deleting them.
    const restored = draft.text ? editor.schema.nodeFromJSON(importMarginMarkdown(draft.text)).content : Fragment.empty;
    editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, restored));
    editor.commands.focus();
  }

  return (
    <NodeViewWrapper
      className={`margin-component-node${selected ? " is-selected" : ""}`}
      data-component-kind={kind || undefined}
    >
      <div className="margin-component-frame">
        {draft ? <InlineInsert draft={draft} onInsert={finish} onTextChange={text => updateAttributes({ src: draftComponentSource(draft.kind, text) })} onRemove={cancel} /> : <>
        <div className="margin-component-actions editor-button-surface" contentEditable={false}>
          <button
            type="button"
            className="margin-component-edit"
            title={`Edit ${label} settings`}
            aria-label={`Edit ${label} settings`}
            onClick={openSettings}
          >
            <Settings2 size={14} aria-hidden="true" />
            <span>Edit {label}</span>
          </button>
        </div>
        <div className="margin-component-preview">
          <MarginPreview src={src} />
        </div>
        </>}
      </div>
    </NodeViewWrapper>
  );
}
