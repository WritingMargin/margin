import { useState, type FormEvent } from "react";
import { api, json } from "../api";
import ReaderAuth from "./ReaderAuth";
import type { CommentAuth } from "./useCommentAuth";
import "./passage-flags.css";

export default function PassageFlagComposer({ postId, revision, quote, occurrence, auth, onSaved }: {
  postId: string;
  revision: string;
  quote: string;
  occurrence: number;
  auth: CommentAuth;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"unclear" | "outdated">("unclear");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!auth.reader) return <ReaderAuth auth={auth} prompt="Sign in to suggest an improvement." />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api(`/public/posts/${postId}/flags`, json("POST", { revision, quote, occurrence, kind, body: body.trim() }));
      setBody("");
      setMessage("Thanks. Your feedback is with the writer for review.");
      onSaved();
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally { setBusy(false); }
  }
  return <form className="passage-flag-form" onSubmit={(event) => void submit(event)}>
    <blockquote>{quote}</blockquote>
    <p>Tell the writer what needs attention. Your feedback stays private unless they publish a fix with credit.</p>
    <fieldset><legend>What needs attention?</legend>
      <label><input type="radio" name="flag-kind" checked={kind === "unclear"} onChange={() => setKind("unclear")} /> Unclear</label>
      <label><input type="radio" name="flag-kind" checked={kind === "outdated"} onChange={() => setKind("outdated")} /> Out of date</label>
    </fieldset>
    <label>Your suggestion<textarea required maxLength={2000} rows={5} placeholder="Explain the issue or suggest wording. You can quote the part you’d change." value={body} onChange={(event) => setBody(event.target.value)} /></label>
    <button type="submit" className="button primary" disabled={busy || !body.trim()}>{busy ? "Sending…" : "Send"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
