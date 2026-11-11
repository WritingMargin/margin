import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Post } from "../../shared/types";
import { api, json } from "../api";
import "./poll-admin.css";

type PollSummary = {
  id: string;
  title: string;
  options: { id: string; label: string }[];
  counts: Record<string, number>;
  total: number;
  resultsVisibility: "" | "after-vote" | "after-close";
  closesAt: string;
  closed: boolean;
  duplicate: boolean;
  reasons?: { optionId: string; reason: string; createdAt: string }[];
};
type PollList = { polls: PollSummary[] };

export default function PollAdminPanel({ post }: { post: Post }) {
  const [data, setData] = useState<PollList | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const path = `/posts/${post.id}/polls`;
  useEffect(() => {
    if (post.status !== "published") return;
    let active = true;
    api<PollList>(path).then(value => { if (active) setData(value); })
      .catch(cause => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [path, post.id, post.status, post.revision]);
  if (post.status !== "published")
    return <p className="muted">Publish this article to see its poll results.</p>;

  async function close(id: string) {
    if (busy) return;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await api(`${path}/${encodeURIComponent(id)}/close`, json("POST", {}));
      setData(await api<PollList>(path));
      setConfirm("");
      setMessage("Voting closed. Final results are now visible to readers.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      setData(await api<PollList>(path));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  return <section className="poll-admin" aria-label="Article polls">
    <div className="poll-admin-title"><h3>Polls in this article</h3><button type="button" className="button" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Refreshing…" : "Refresh results"}</button></div>
    <p>Readers vote once. Choose when results appear in each Poll block; a close date and time is required when results wait until voting closes.</p>
    {error && <p className="error-box" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading polls…</p>}
    {data?.polls.length === 0 && <p className="poll-admin-empty">No polls in the published article yet.</p>}
    {data?.polls.map((poll, index) => <article className="poll-admin-card" key={`${poll.id}-${index}`}>
      <div className="poll-admin-heading">
        <div><span className="eyebrow">{poll.closed ? "VOTING CLOSED" : "VOTING OPEN"}</span><h4>{poll.title}</h4></div>
        <strong>{poll.total} {poll.total === 1 ? "vote" : "votes"}</strong>
      </div>
      <p className="poll-admin-meta">{poll.resultsVisibility === "after-close" ? "Results appear when voting closes" : "Results appear after voting"}{poll.closesAt ? <> · Closes <time dateTime={poll.closesAt}>{formatDate(poll.closesAt)}</time></> : null}</p>
      {poll.options.map(option => {
        const count = poll.counts[option.id] || 0;
        const percent = poll.total ? Math.round(count / poll.total * 100) : 0;
        return <div className="poll-admin-result" key={option.id}>
          <div><span>{option.label}</span><strong>{percent}% <small>({count})</small></strong></div>
          <span className="poll-admin-bar"><span style={{ width: `${percent}%` }} /></span>
        </div>;
      })}
      <PollReasons poll={poll} />
      {poll.duplicate && <p className="poll-admin-warning">This poll ID appears more than once. Give each poll a unique ID in the article before managing it.</p>}
      {!poll.closed && !poll.duplicate && <div className="poll-admin-actions">
        {confirm === poll.id ? <>
          <span>Close voting now? Readers will see final results, and this cannot be reopened.</span>
          <button type="button" className="button" disabled={busy === poll.id} onClick={() => void close(poll.id)}>{busy === poll.id ? "Closing…" : "Confirm close"}</button>
          <button type="button" className="button" onClick={() => setConfirm("")}>Cancel</button>
        </> : <button type="button" className="button" onClick={() => setConfirm(poll.id)}>Close voting early</button>}
      </div>}
    </article>)}
    {message && <p className="small-text" role="status">{message}</p>}
  </section>;
}

function PollReasons({ poll }: { poll: PollSummary }) {
  if (!poll.reasons?.length) return null;
  return <details className="margin-accordion poll-admin-reasons">
    <summary>Voter reasons ({poll.reasons.length})<ChevronDown size={16} aria-hidden="true" /></summary>
    <div className="margin-accordion-content">
      {poll.reasons.map((entry, reasonIndex) => <div className="poll-admin-reason" key={`${entry.createdAt}-${reasonIndex}`}>
        <span>{poll.options.find(option => option.id === entry.optionId)?.label || "Vote"} · <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time></span>
        <p>{entry.reason}</p>
      </div>)}
    </div>
  </details>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
