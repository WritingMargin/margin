import { useState } from "react";
import { X } from "lucide-react";
import CitationPicker from "../../citations/CitationPicker";
import MediaPicker from "../../media/MediaPicker";
import TabsPicker from "../../blocks/TabsPicker";
import BlockPicker from "../../blocks/BlockPicker";
import type { DraftComponent } from "./draft-component";
import "./inline-insert.css";

/** The same Margin pickers, mounted at the insertion point instead of a dialog. */
export default function InlineInsert({
  draft,
  onInsert,
  onTextChange,
  onRemove,
}: {
  draft: DraftComponent;
  onInsert: (source: string) => void;
  onTextChange: (text: string) => void;
  onRemove: () => void;
}) {
  const [status, setStatus] = useState("");
  return (
    <section
      className="writer-inline-insert editor-button-surface"
      aria-label={`Insert ${draft.kind}`}
      contentEditable={false}
    >
      <button
        type="button"
        className="writer-inline-insert-close"
        aria-label="Cancel insertion"
        onClick={onRemove}
      >
        <X size={16} />
      </button>
      {draft.kind === "citation" ? (
        <CitationPicker
          text={draft.text}
          onTextChange={onTextChange}
          onInsert={(before, after = "") =>
            onInsert(before + draft.text.replace(/\s*\n\s*/g, " ") + after)
          }
        />
      ) : draft.kind === "media" ? (
        <MediaPicker onInsert={onInsert} notify={setStatus} />
      ) : draft.kind === "tabs" ? (
        <TabsPicker onInsert={onInsert} />
      ) : (
        <BlockPicker onInsert={onInsert} />
      )}
      {status && <p role="status">{status}</p>}
    </section>
  );
}
