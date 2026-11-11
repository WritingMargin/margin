import { useCallback, useEffect, useState } from "react";
import { Check, Flag, X } from "lucide-react";
import { api, json } from "../api";
import { sitePath } from "../base-path";
import Empty from "../components/Empty";
import Select from "../components/Select";
import "./social.css";

type FlagStatus = "pending" | "accepted" | "applied" | "dismissed";
type SectionFlag = {
  id: string;
  postId: string;
  postTitle: string;
  quote: string;
  kind: "unclear" | "outdated" | "step_problem";
  body: string;
  proposedText: string;
  status: FlagStatus;
  createdAt: string;
  contributorName: string;
  acceptedDraftRevision?: string;
  appliedRevision?: string;
};
type FlagPage = { flags: SectionFlag[]; hasMore: boolean; counts: Record<FlagStatus, number> };
type WorkingDraft = { revision: string; title: string; content: string; baseRevision?: string };

export default function FlagsAdmin({ notify, embedded = false }: { notify: (message: string) => void; embedded?: boolean }) {
  const [status, setStatus] = useState<FlagStatus>("pending");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<FlagPage | null>(null);
  const [busy, setBusy] = useState("");
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [reviewFlag, setReviewFlag] = useState<SectionFlag | null>(null);
  const load = useCallback(async () => {
    setError("");
    try {
      setPage(await api<FlagPage>(`/readers/flags?status=${status}&offset=${offset}`));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, [status, offset]);
  useEffect(() => { void load(); }, [load, version]);
  async function act(flag: SectionFlag, action: "accept" | "dismiss") {
    setBusy(flag.id);
    try {
      await api(`/readers/flags/${flag.id}`, json("PATCH", { action }));
      notify(action === "accept" ? "Proposed fix added to the working draft." : "Flag dismissed.");
      setVersion((current) => current + 1);
    } catch (cause) {
      notify((cause as Error).message);
    } finally {
      setBusy("");
    }
  }
  return <section className="reader-flags" aria-label="Section flags">
    <div className="reader-flags-intro">
      <FlagsIntro embedded={embedded} />
      <label>Status<Select value={status} onChange={(event) => { setStatus(event.target.value as FlagStatus); setOffset(0); }}>
        <option value="pending">Pending</option><option value="accepted">In a draft</option><option value="applied">Published</option><option value="dismissed">Dismissed</option>
      </Select></label>
    </div>
    <FlagsError error={error} retry={load} />
    {!page && !error && <p role="status">Loading section feedback…</p>}
    {page && <>
      <p className="conversation-result-count" role="status">{page.counts?.[status] ?? page.flags.length} {status} {page.counts?.[status] === 1 ? "flag" : "flags"}</p>
      {!page.flags.length && <Empty icon={<Flag />} title="No feedback here yet." text="Reader suggestions for this status will appear here." />}
      <div className="reader-flag-list">{page.flags.map((flag) => <FlagCard key={flag.id} flag={flag} busy={!!busy} onAction={act} onReview={() => setReviewFlag(flag)} />)}</div>
      <ReviewSlot flag={reviewFlag} onClose={() => setReviewFlag(null)} onChanged={() => { setReviewFlag(null); setVersion((current) => current + 1); }} notify={notify} />
      <nav className="reader-flag-pagination" aria-label="Section feedback pages">
        <button type="button" className="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button>
        <span>Page {Math.floor(offset / 20) + 1}</span>
        <button type="button" className="button" disabled={!page.hasMore} onClick={() => setOffset(offset + 20)}>Next</button>
      </nav>
    </>}
  </section>;
}

function FlagsError({ error, retry }: { error: string; retry: () => Promise<void> }) {
  return error ? <div className="error-box" role="alert">{error} <button type="button" className="button" onClick={() => void retry()}>Retry</button></div> : null;
}

function FlagsIntro({ embedded }: { embedded: boolean }) {
  return <div>{!embedded && <><span className="eyebrow">MAKE ARTICLES CLEARER</span><h2>Section feedback</h2></>}<p>Review reader suggestions and problems reported with guide steps.</p></div>;
}

function FlagCard({ flag, busy, onAction, onReview }: { flag: SectionFlag; busy: boolean; onAction: (flag: SectionFlag, action: "accept" | "dismiss") => void; onReview: () => void }) {
  return <article className="comment-card reader-flag-card">
    <div><span className="profile-avatar">{flag.contributorName?.charAt(0).toUpperCase() || "R"}</span><div><strong>{flag.contributorName || "Reader"}</strong><small>{new Date(flag.createdAt).toLocaleDateString()} · {flagKindLabel(flag.kind)}</small></div><span className="status-pill">{flag.status}</span></div>
    <a className="reader-flag-post" href={sitePath(`/admin/posts/${encodeURIComponent(flag.postId)}`)}>{flag.postTitle}</a>
    <blockquote>{flag.quote}</blockquote>
    {flag.body && <p>{flag.body}</p>}
    {flag.proposedText && <div className="reader-flag-proposal"><strong>Proposed wording</strong><p>{flag.proposedText}</p></div>}
    <FlagCardStatus flag={flag} busy={busy} onAction={onAction} onReview={onReview} />
  </article>;
}
function FlagCardStatus({ flag, busy, onAction, onReview }: { flag: SectionFlag; busy: boolean; onAction: (flag: SectionFlag, action: "accept" | "dismiss") => void; onReview: () => void }) {
  if (flag.status === "accepted") return <footer><p className="small-text">The reviewed fix is in the working draft. Review it before publishing to credit this contributor.</p><button type="button" className="button primary" onClick={onReview}>Review working draft</button></footer>;
  if (flag.status === "applied") return <p className="small-text">Published with contributor credit.</p>;
  if (flag.status !== "pending") return null;
  return <footer>
    <button type="button" className="button primary" disabled={busy} onClick={onReview}><Check size={14} /> Review feedback</button>
    <button type="button" className="button" disabled={busy} onClick={() => onAction(flag, "dismiss")}><X size={14} /> Dismiss</button>
  </footer>;
}

function ReviewSlot({ flag, onClose, onChanged, notify }: { flag: SectionFlag | null; onClose: () => void; onChanged: () => void; notify: (message: string) => void }) {
  return flag ? <WorkingDraftReview flag={flag} onClose={onClose} onChanged={onChanged} notify={notify} /> : null;
}

function WorkingDraftReview({ flag, onClose, onChanged, notify }: { flag: SectionFlag; onClose: () => void; onChanged: () => void; notify: (message: string) => void }) {
  const [draft, setDraft] = useState<WorkingDraft | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<WorkingDraft>(`/posts/${flag.postId}/draft`).then((result) => { if (active) { setDraft(result); setContent(result.content); } }).catch((cause) => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [flag.postId]);
  async function save() {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<WorkingDraft>(`/posts/${flag.postId}/draft`, json("PUT", { revision: draft.revision, content }));
      setDraft(result); setContent(result.content); notify("Working draft saved. The live article is unchanged.");
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  async function publish() {
    if (!draft || busy || content !== draft.content) return;
    setBusy(true); setError("");
    try {
      await api(`/posts/${flag.postId}/draft/publish`, json("POST", { revision: draft.revision }));
      notify("Reviewed draft published with contributor credit."); onChanged();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  async function accept() {
    if (!draft || busy || content === draft.content) return;
    setBusy(true); setError("");
    try {
      await api(`/readers/flags/${flag.id}`, json("PATCH", { action: "accept", reviewedContent: content, revision: draft.revision }));
      notify("Reviewed fix saved to the working draft. Publish it to credit this contributor."); onChanged();
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <section className="reader-draft-review" aria-label="Review working draft">
    <div className="reader-draft-heading"><div><span className="eyebrow">WORKING DRAFT</span><h3>Review reader feedback</h3><p>Check the full article and edit the wording before publishing. The live article stays unchanged until you publish.</p></div><button type="button" className="button" onClick={onClose}>Close</button></div>
    {error && <p role="alert" className="error-box">{error}</p>}
    {!draft ? <p role="status">Loading working draft…</p> : <>
      {flag.status === "pending" && <div className="reader-draft-proposal"><strong>Reader’s suggestion</strong><blockquote>{flag.quote}</blockquote><p>{flag.body}</p>{flag.proposedText && <p>{flag.proposedText}</p>}</div>}
      <label htmlFor="reader-draft-content">{draft.title} · Markdown</label>
      <textarea id="reader-draft-content" value={content} onChange={(event) => setContent(event.target.value)} rows={14} spellCheck={false} />
      <div className="reader-draft-actions">{flag.status === "pending" ? <button type="button" className="button primary" disabled={busy || content === draft.content} onClick={() => void accept()}>Accept into draft</button> : <><button type="button" className="button" disabled={busy || content === draft.content} onClick={() => void save()}>Save draft</button><button type="button" className="button primary" disabled={busy || content !== draft.content} onClick={() => void publish()}>Publish reviewed draft</button></>}</div>
    </>}
  </section>;
}

function flagKindLabel(kind: SectionFlag["kind"]) { return { unclear: "Unclear", outdated: "Out of date", step_problem: "Guide step problem" }[kind]; }
