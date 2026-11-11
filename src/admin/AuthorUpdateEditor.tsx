import { useEffect, useState } from "react";
import { api, json } from "../api";

type AuthorUpdate = {
  id: string;
  body: string;
  revision: string;
  createdAt: string;
  updatedAt: string;
  deliveryStatus: { pending: number; sending: number; accepted: number; uncertain: number; skipped: number };
};
type Response = { authorUpdate: AuthorUpdate | null };

export default function AuthorUpdateEditor({ postId, published }: { postId: string; published: boolean }) {
  if (!postId || !published) return <p className="muted">Publish this article before pinning an author update.</p>;
  return <PublishedAuthorUpdateEditor postId={postId} />;
}

function PublishedAuthorUpdateEditor({ postId }: { postId: string }) {
  const [saved, setSaved] = useState<AuthorUpdate | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    api<Response>(`/posts/${postId}/author-update`).then(({ authorUpdate }) => {
      if (active) { setSaved(authorUpdate); setBody(authorUpdate?.body || ""); }
    }).catch((cause) => { if (active) setMessage((cause as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [postId]);
  async function save() {
    if (busy || body.trim() === (saved?.body || "")) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<Response>(`/posts/${postId}/author-update`, json("PUT", { body: body.trim() }));
      setSaved(result.authorUpdate);
      setBody(result.authorUpdate?.body || "");
      setMessage(result.authorUpdate ? "Author update published. Delivery status appears below." : "Author update removed.");
    } catch (cause) {
      setMessage((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="author-update-editor" aria-label="Pinned author update">
    <h3>Pin a note to this article</h3>
    <p>A short update appears below the article opening. Publishing it notifies confirmed subscribers once.</p>
    {loading ? <p role="status">Loading author update…</p> : <>
      <label htmlFor="author-update-body">Your update</label>
      <textarea id="author-update-body" rows={5} maxLength={500} value={body} onChange={(event) => setBody(event.target.value)} placeholder="What should readers know now?" />
      <div className="author-update-actions"><small>{body.length}/500 characters</small><button type="button" className="button primary" disabled={busy || body.trim() === (saved?.body || "")} onClick={() => void save()}>{busy ? "Saving…" : body.trim() ? "Publish and notify" : "Remove update"}</button></div>
      {saved && <p className="small-text">{deliverySummary(saved.deliveryStatus)}</p>}
    </>}
    {message && <p role="status" className="small-text">{message}</p>}
  </section>;
}

function deliverySummary(status: AuthorUpdate["deliveryStatus"] | undefined) {
  if (!status) return "Notification status is unavailable.";
  const total = status.pending + status.sending + status.accepted + status.uncertain + status.skipped;
  if (!total) return "No confirmed subscribers to notify.";
  const parts = [
    status.pending && `${status.pending} queued`,
    status.sending && `${status.sending} sending`,
    status.accepted && `${status.accepted} accepted by the email provider`,
    status.uncertain && `${status.uncertain} need delivery review`,
    status.skipped && `${status.skipped} skipped`,
  ].filter(Boolean);
  return `Subscriber notifications: ${parts.join(" · ")}.`;
}
