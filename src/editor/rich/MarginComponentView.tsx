import { memo, useCallback, type MouseEvent } from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import Markdown from "../../Markdown";
import { openComponentSettings } from "./component-edit";
import { Settings2 } from "lucide-react";

const MarginPreview = memo(function MarginPreview({ src }: { src: string }) {
  return <Markdown content={src} />;
});

/**
 * A component inside the writer renders exactly like the reader sees it and
 * stays interactive, so tabs, galleries and players work in place. The edit
 * button opens its compact settings without hijacking the component itself.
 */
export default function MarginComponentView({ node, getPos, selected, editor }: ReactNodeViewProps) {
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

  return (
    <NodeViewWrapper
      className={`margin-component-node${selected ? " is-selected" : ""}`}
      data-component-kind={kind || undefined}
    >
      <div className="margin-component-frame">
        <div className="margin-component-preview">
          <MarginPreview src={src} />
        </div>
        <button
          type="button"
          className="margin-component-edit"
          title={`Edit ${label} settings`}
          aria-label={`Edit ${label} settings`}
          onClick={openSettings}
        >
          <Settings2 size={14} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </div>
    </NodeViewWrapper>
  );
}
