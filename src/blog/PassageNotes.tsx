import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, LockKeyhole, StickyNote } from "lucide-react";
import type { ReaderNote } from "../../shared/interactions";
import { api, json } from "../api";
import ReaderAuth from "./ReaderAuth";
import type { CommentAuth } from "./useCommentAuth";

type Props = {
  postId: string;
  revision: string;
  quote: string;
  occurrence: number;
  notesEnabled: boolean;
  auth: CommentAuth;
  onSaved: () => void;
};
type Draft = { id?: string; quote: string; occurrence: number; body: string };

export default function PassageNotes(props: Props) {
  return <ReaderAuth auth={props.auth} prompt="Sign in to keep private notes on this article.">
    <Notebook {...props} />
  </ReaderAuth>;
}

function Notebook({ postId, revision, quote, occurrence, notesEnabled, onSaved }: Props) {
  const [notes, setNotes] = useState<ReaderNote[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(notesEnabled && quote ? { quote, occurrence, body: "" } : null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const path = `/public/posts/${postId}/notes`;

  useEffect(() => {
    let active = true;
    api<ReaderNote[]>(path).then((result) => {
      if (active) { setNotes(result); setMessage(""); }
    }).catch((error) => {
      if (active) setMessage((error as Error).message);
    });
    return () => { active = false; };
  }, [path]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.body.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (draft.id) await api(`/public/notes/${draft.id}`, json("PATCH", { body: draft.body.trim() }));
      else await api(path, json("POST", { body: draft.body.trim(), quote: draft.quote, occurrence: draft.occurrence, revision }));
      setNotes(await api<ReaderNote[]>(path));
      setDraft(null);
      onSaved();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/public/notes/${id}`, { method: "DELETE" });
      setNotes(await api<ReaderNote[]>(path));
      setDraft(null);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="notebook">
    {draft
      ? <NotebookEditor draft={draft} setDraft={setDraft} busy={busy} save={save} remove={remove} />
      : <NotebookList notes={notes} notesEnabled={notesEnabled} message={message} setDraft={setDraft} />}
    {message && <p className="notebook-message" role="status">{message}</p>}
  </div>;
}

function NotebookList({ notes, notesEnabled, message, setDraft }: {
  notes: ReaderNote[] | null;
  notesEnabled: boolean;
  message: string;
  setDraft: (draft: Draft) => void;
}) {
  return <>
    {notesEnabled && <button type="button" className="notebook-capture" onClick={() => setDraft({ quote: "", occurrence: 0, body: "" })}>
      <StickyNote size={18} aria-hidden="true" /><span>Take a note…</span>
    </button>}
    <p className="notebook-privacy"><LockKeyhole size={13} aria-hidden="true" /> Private to you</p>
    {notes === null && !message && <p className="notebook-loading" role="status">Loading notes…</p>}
    {notes?.length === 0 && <div className="notebook-empty">
      <span className="notebook-empty-icon"><StickyNote size={27} strokeWidth={1.4} aria-hidden="true" /></span>
      <h3>No notes yet</h3>
      <p>{notesEnabled ? "Keep a thought for later, or highlight a passage to save it with a quote." : "New notes are paused. Your saved notes will stay here."}</p>
    </div>}
    {notes && notes.length > 0 && <div className="notebook-list" aria-label="Saved notes">
      {notes.map((note) => <button type="button" className="notebook-card" key={note.id} onClick={() => setDraft({ id: note.id, quote: note.quote, occurrence: 0, body: note.body })}>
        {note.quote && <span className="notebook-card-quote">“{note.quote}”{note.anchor_status === "earlier" && <small>Earlier version</small>}</span>}
        <span className="notebook-card-body">{note.body}</span>
      </button>)}
    </div>}
  </>;
}

function NotebookEditor({ draft, setDraft, busy, save, remove }: {
  draft: Draft;
  setDraft: (draft: Draft | null) => void;
  busy: boolean;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.max(190, input.scrollHeight + 2)}px`;
  }, [draft.body]);
  return <>
    <button type="button" className="notebook-back" onClick={() => setDraft(null)}><ArrowLeft size={15} aria-hidden="true" /> All notes</button>
    <form className="notebook-editor" onSubmit={(event) => void save(event)}>
      {draft.quote && <blockquote>{draft.quote}</blockquote>}
      <label htmlFor={inputId}>{draft.id ? "Edit note" : "New note"}</label>
      <textarea ref={inputRef} id={inputId} required maxLength={10000} rows={8} placeholder="Write a thought for later…" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
      <div className="notebook-editor-actions">
        <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save note"}</button>
        <button type="button" className="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
        {draft.id && <button type="button" className="text-link notebook-delete" disabled={busy} onClick={() => void remove(draft.id!)}>Delete note</button>}
      </div>
    </form>
  </>;
}
