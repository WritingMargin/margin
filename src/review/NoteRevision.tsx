import { useState } from "react";
import { api } from "../api";
import type { Post } from "../../shared/types";
import type { ReviewNote } from "./types";
import PostDiff from "../editor/PostDiff";

export default function NoteRevision({
  note,
  postID,
  reviewPath,
}: {
  note: ReviewNote;
  postID?: string;
  reviewPath?: string;
}) {
  const [diff, setDiff] = useState<{
    revision: Post;
    addressed_revision: Post;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      if (reviewPath) {
        setDiff(await api(reviewPath + "/notes/" + note.id + "/fix"));
        return;
      }
      const base = "/posts/" + postID + "/revisions/";
      const [before, after] = await Promise.all([
        api<Post>(base + note.revision),
        api<Post>(base + note.addressed_revision),
      ]);
      setDiff({ revision: before, addressed_revision: after });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open && !diff && !busy) void load();
      }}
    >
      <summary>
        Addressed · View revision {note.addressed_revision.slice(0, 8)}
      </summary>
      {diff && (
        <PostDiff before={diff.revision} after={diff.addressed_revision} />
      )}
      {busy && <p role="status">Loading revision…</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
