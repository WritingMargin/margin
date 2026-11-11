import { useEffect, useState } from "react";
import { api } from "../api";
import type { SavedWritingNote } from "../../shared/writing";
import KeptInsight from "./KeptInsight";
import "./writing-insights.css";

export default function SavedWritingNotes({
  visible,
  postId,
}: {
  visible: boolean;
  postId: string;
}) {
  const [notes, setNotes] = useState<SavedWritingNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!postId || !visible) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<SavedWritingNote[]>("/posts/" + postId + "/writing-notes", {
      signal: controller.signal,
    })
      .then((items) => {
        if (!controller.signal.aborted) setNotes(items);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [postId, visible, attempt]);
  return (
    <section className="assistant-insights" aria-label="Saved article notes">
      <header>
        <h3>Saved insights</h3>
        <p>
          {postId
            ? "Private notes kept with this draft."
            : "Save the draft to keep insights with it."}
        </p>
      </header>
      {loading && (
        <p className="small-text" role="status">
          Loading saved notes…
        </p>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
          <button
            type="button"
            className="button"
            onClick={() => setAttempt((v) => v + 1)}
          >
            Retry notes
          </button>
        </div>
      )}
      {notes.map((saved) => (
        <KeptInsight key={saved.id} saved={saved} />
      ))}
      {postId && !loading && !error && !notes.length && (
        <p className="assistant-empty-insights">
          Ask in chat to save a thought, or choose “Keep insight” beside a
          suggestion.
        </p>
      )}
    </section>
  );
}
