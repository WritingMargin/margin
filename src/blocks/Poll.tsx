import { createContext, useContext, useEffect, useState, type FormEvent } from "react";
import { api, json } from "../api";
import ReaderAuth from "../blog/ReaderAuth";
import { useCommentAuth } from "../blog/useCommentAuth";
import type { PollSpec } from "./schema";

export const PollPostContext = createContext<{ id: string; revision: string } | null>(null);

type Results = {
  counts?: Record<string, number>;
  total?: number;
  votedOption: string | null;
  reasonEnabled: boolean;
  resultsVisible: boolean;
  closed: boolean;
  closesAt: string;
};

export default function Poll({ spec }: { spec: PollSpec }) {
  const post = useContext(PollPostContext);
  const options = spec.type === "agree-disagree"
    ? [{ id: "agree", label: "Agree" }, { id: "disagree", label: "Disagree" }]
    : spec.options || [];
  if (!post) return <div className="block-poll"><p>Poll preview · {options.map(option => option.label).join(" / ")}</p><p className="poll-deadline">{spec.resultsVisibility === "after-close" ? "Results appear when voting closes" : "Results appear after a reader votes"}{spec.closesAt ? ` · Closes ${formatPollDate(spec.closesAt)}` : ""}</p></div>;
  return <LivePoll spec={spec} post={post} options={options} />;
}

function LivePoll({ spec, post, options }: {
  spec: PollSpec;
  post: { id: string; revision: string };
  options: { id: string; label: string }[];
}) {
  const auth = useCommentAuth();
  const [results, setResults] = useState<Results | null>(null);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const path = `/public/posts/${post.id}/polls/${spec.id}`;
  useEffect(() => {
    let active = true;
    api<Results>(path).then(value => {
      if (active) setResults(value);
    }).catch(error => {
      if (active) setMessage(error.message);
    });
    return () => { active = false; };
  }, [path, post.revision, auth.reader]);
  useEffect(() => {
    if (!results?.closesAt || results.closed) return;
    let active = true;
    let timer: number;
    const closeTime = Date.parse(results.closesAt);
    const refreshAtClose = () => {
      const remaining = closeTime - Date.now();
      if (remaining > 0) {
        timer = window.setTimeout(refreshAtClose, Math.min(remaining + 250, 2_147_000_000));
        return;
      }
      api<Results>(path).then(value => { if (active) setResults(value); }).catch(error => { if (active) setMessage(error.message); });
    };
    refreshAtClose();
    return () => { active = false; window.clearTimeout(timer); };
  }, [path, results?.closesAt, results?.closed]);
  async function vote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const value = await api<Results>(path, json("POST", {
        optionId: selected, revision: post.revision,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }));
      setResults(value);
      setMessage("Vote saved.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <div className="block-poll">
    {results?.closesAt && <p className="poll-deadline">{results.closed ? "Voting closed" : "Voting closes"} <time dateTime={results.closesAt}>{formatPollDate(results.closesAt)}</time></p>}
    <PollBody results={results} auth={auth} spec={spec} options={options} selected={selected}
      setSelected={setSelected} reason={reason} setReason={setReason}
      busy={busy} vote={vote} />
    {message && <p role="status">{message}</p>}
  </div>;
}

function PollBody({ results, auth, spec, options, selected, setSelected, reason, setReason, busy, vote }: {
  results: Results | null;
  auth: ReturnType<typeof useCommentAuth>;
  spec: PollSpec;
  options: { id: string; label: string }[];
  selected: string; setSelected: (value: string) => void;
  reason: string; setReason: (value: string) => void;
  busy: boolean;
  vote: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!results) return <p className="poll-status" role="status">Loading poll…</p>;
  if (results.closed && results.resultsVisible) return <PollResults options={options} results={results} />;
  if (!auth.reader) return <ReaderAuth auth={auth} />;
  if (results.votedOption && results.resultsVisible) return <PollResults options={options} results={results} />;
  if (results.votedOption) return <p className="poll-status" role="status">Your vote was saved. Results will appear when voting closes.</p>;
  if (results.closed) return <p className="poll-status">Voting has closed.</p>;
  return <PollForm spec={spec} options={options} selected={selected} setSelected={setSelected}
    reason={reason} setReason={setReason}
    reasonEnabled={results.reasonEnabled} busy={busy} vote={vote} />;
}

function PollResults({ options, results }: { options: { id: string; label: string }[]; results: Results }) {
  return <div aria-label="Poll results">
    {options.map(option => {
      const count = results.counts?.[option.id] || 0;
      const percent = results.total ? Math.round(count / results.total * 100) : 0;
      return <div className="poll-result" key={option.id}>
        <div><span>{option.label}{results.votedOption === option.id ? " · Your vote" : ""}</span><strong>{percent}%</strong></div>
        <span className="poll-bar"><span style={{ width: `${percent}%` }} /></span>
      </div>;
    })}
    <p>{results.total || 0} {results.total === 1 ? "vote" : "votes"}</p>
  </div>;
}

function formatPollDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}


function PollForm({ spec, options, selected, setSelected, reason, setReason, reasonEnabled, busy, vote }: {
  spec: PollSpec;
  options: { id: string; label: string }[];
  selected: string; setSelected: (value: string) => void;
  reason: string; setReason: (value: string) => void;
  reasonEnabled: boolean; busy: boolean;
  vote: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <form onSubmit={vote}>
      <fieldset><legend className="sr-only">Choose one answer</legend>
        {options.map(option => <label className="poll-option" key={option.id}>
          <input type="radio" name={`poll-${spec.id}`} value={option.id} checked={selected === option.id} onChange={() => setSelected(option.id)} />
          {option.label}
        </label>)}
      </fieldset>
      {spec.type === "agree-disagree" && spec.allowReason && reasonEnabled && <>
        <label>Why? (optional)
          <textarea maxLength={10000} value={reason} onChange={event => setReason(event.target.value)} />
        </label>
        <p className="small-text">Only the writer can read your reason.</p>
      </>}
      <button type="submit" disabled={!selected || busy}>{busy ? "Voting…" : "Vote"}</button>
    </form>;
}
