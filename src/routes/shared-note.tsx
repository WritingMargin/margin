import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Check, Copy } from "lucide-react";
import {
  formatNoteForCopy,
  noteDisplayTitle,
  noteBody,
  withSharedNoteCovers,
  type SharedNote,
} from "../../shared/notes";
import { api } from "../api";
import { date } from "../admin/post-utils";
import Markdown from "../Markdown";
import "../notes/notes.css";

export const meta = () => [
  { title: "Shared note — Margin" },
  { name: "robots", content: "noindex, nofollow" },
];

export default function SharedNoteRoute() {
  const { token = "" } = useParams();
  const [note, setNote] = useState<SharedNote | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Shared note not found.");
      return;
    }
    let active = true;
    setError("");
    api<SharedNote>(`/public/notes/${encodeURIComponent(token)}`)
      .then((data) => {
        if (active) setNote(data);
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function copyNote() {
    if (!note) return;
    try {
      await navigator.clipboard.writeText(formatNoteForCopy(note));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable.
    }
  }

  return (
    <main className="shared-note-page">
      <article className="shared-note-card">
        {error ? (
          <div role="alert">
            <h1>Note unavailable</h1>
            <p className="muted">{error}</p>
          </div>
        ) : note ? (
          <SharedNoteContent
            note={note}
            token={token}
            copied={copied}
            onCopy={() => void copyNote()}
          />
        ) : (
          <p role="status">Loading shared note…</p>
        )}
      </article>
    </main>
  );
}

function SharedNoteContent({
  note,
  token,
  copied,
  onCopy,
}: {
  note: SharedNote;
  token: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <>
      <header className="shared-note-header">
        <div>
          <span className="eyebrow">SHARED NOTE</span>
          <h1>{noteDisplayTitle(note)}</h1>
          <p className="shared-note-meta">
            {note.authorName ? `By ${note.authorName} · ` : ""}
            Updated {date(note.updatedAt)}
          </p>
        </div>
        <button type="button" className="button" onClick={onCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy note"}
        </button>
      </header>
      <Markdown
        content={withSharedNoteCovers(
          noteBody(note) || "_This note has no text yet._",
          token,
        )}
      />
    </>
  );
}
