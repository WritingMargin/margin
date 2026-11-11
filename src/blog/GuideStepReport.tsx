import { useState, type FormEvent } from "react";
import { api, json } from "../api";
import ReaderAuth from "./ReaderAuth";
import type { CommentAuth } from "./useCommentAuth";
import type { GuideStep } from "./guide-progress";

export default function GuideStepReport({step, postId, revision, auth, onBack}: {step: GuideStep; postId:string; revision:string; auth:CommentAuth; onBack:()=>void}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true); setMessage("");
    try {
      await api(`/public/posts/${encodeURIComponent(postId)}/guide-reports`, json("POST", {section:step.id, revision, body:body.trim()}));
      setSent(true);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  if (sent) return <div className="guide-report-sent"><p role="status">Your report was sent to the writer.</p><p>You can return to the guide while the writer reviews your report.</p><button type="button" onClick={onBack}>Back to guide</button></div>;
  return <div className="guide-step-report">
    <button type="button" className="guide-back" onClick={onBack}>← Back to steps</button>
    <h3>Report a problem</h3><p className="guide-report-target">{step.title}</p>
    <p>Tell the writer what you tried and what went wrong. Your report is private.</p>
    <ReaderAuth auth={auth} showSession={false} prompt="Sign in to send this step’s problem to the writer."><form onSubmit={event => void submit(event)}>
        <label>What went wrong?<textarea required maxLength={2000} rows={4} value={body} onChange={event=>setBody(event.target.value)} placeholder="For example: I followed the instructions, but got an error…" /></label>
        <button type="submit" disabled={busy || !body.trim()}>{busy ? "Sending…" : "Send report"}</button>
        {message && <p role="alert">{message}</p>}
      </form></ReaderAuth>
  </div>;
}
