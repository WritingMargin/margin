import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StickyNote, X } from "lucide-react";
import { usePassageSelection } from "../blog/usePassageSelection";
import type { Post } from "../../shared/types";
import ReviewMarkers from "./ReviewMarkers";
import type { ReviewNote } from "./types";
import Markdown from "../Markdown";
import "../blog/passage-interactions.css";

type Selection = {
  quote: string;
  occurrence: number;
  top: number;
  left: number;
};
type SaveNote = (
  body: string,
  quote: string,
  occurrence: number,
  submissionId: string,
) => Promise<void>;
export default function ReviewPassages({
  post,
  notes,
  saveNote,
}: {
  post: Post;
  notes: ReviewNote[];
  saveNote: SaveNote;
}) {
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [anchor, setAnchor] = useState<Selection | null>(null);
  usePassageSelection(content, root, true, setSelection);
  return (
    <div ref={root} className="passage-interactions">
      <div ref={content} className="passage-article-content peer-article">
        <Markdown
          content={post.content || ""}
          tableOfContents={post.tableOfContents}
        />
      </div>
      <ReviewMarkers content={content} notes={notes} />
      {selection && !anchor && (
        <div
          className="passage-selection"
          style={{ top: selection.top, left: selection.left }}
          role="toolbar"
          aria-label="Selected passage actions"
        >
          <div className="passage-selection-heading">
            <span title={selection.quote}>“{selection.quote}”</span>
            <button
              type="button"
              className="passage-selection-close"
              aria-label="Dismiss selection"
              onClick={() => setSelection(null)}
            >
              <X size={14} />
            </button>
          </div>
          <div className="passage-selection-actions">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAnchor(selection)}
            >
              <StickyNote size={15} />
              Add section note
            </button>
          </div>
        </div>
      )}
      {anchor && (
        <ReviewNoteComposer
          anchor={anchor}
          close={() => setAnchor(null)}
          saveNote={saveNote}
        />
      )}
    </div>
  );
}
function ReviewNoteComposer({
  anchor,
  close,
  saveNote,
}: {
  anchor: Selection;
  close: () => void;
  saveNote: SaveNote;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const submission = useRef({ id: crypto.randomUUID(), body: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  useEffect(() => {
    textarea.current?.focus();
  }, []);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (submission.current.body !== body)
        submission.current = { id: crypto.randomUUID(), body };
      await saveNote(
        body,
        anchor.quote,
        anchor.occurrence,
        submission.current.id,
      );
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="passage-dialog passage-modal-sheet"
      aria-labelledby="review-note-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <header>
        <h2 id="review-note-title">Review note</h2>
        <button
          type="button"
          className="button"
          aria-label="Close"
          disabled={busy}
          onClick={close}
        >
          <X size={16} />
        </button>
      </header>
      <div className="passage-dialog-body passage-notes">
        <blockquote>{anchor.quote}</blockquote>
        <form
          className="passage-note-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            Your note
            <textarea
              ref={textarea}
              required
              rows={4}
              disabled={busy}
              maxLength={10000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="comment-form-actions">
            <button className="button primary" disabled={busy || !body.trim()}>
              {busy ? "Saving…" : "Save review note"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
