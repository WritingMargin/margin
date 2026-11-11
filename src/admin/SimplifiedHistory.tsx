import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "../api";

type Entry = {
  sourceRevision: string;
  writerRevision: string;
  content: string;
  reviewed: boolean;
  status: "ready" | "hidden";
  savedAt: string;
  kind: "current" | "previous";
};

export default function SimplifiedHistory({ postId, currentSourceRevision }: { postId: string; currentSourceRevision: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  async function load() {
    try { setEntries(await api<Entry[]>(`/posts/${postId}/simplified/history`)); setError(""); }
    catch (failure) { setError((failure as Error).message); }
  }
  return <details className="margin-accordion simplified-history" onToggle={event => { if (event.target === event.currentTarget && event.currentTarget.open) void load(); }}>
    <summary>Version history <ChevronDown size={15} aria-hidden="true" /></summary>
    <div className="margin-accordion-content simplified-history-list">
      {error && <p role="alert">{error}</p>}
      {!entries && !error && <p>Loading versions…</p>}
      {entries?.length === 0 && <p>No saved versions yet.</p>}
      {entries?.map(entry => <HistoryEntry key={`${entry.sourceRevision}:${entry.writerRevision}:${entry.kind}`} entry={entry} currentSourceRevision={currentSourceRevision} />)}
    </div>
  </details>;
}

function HistoryEntry({ entry, currentSourceRevision }: { entry: Entry; currentSourceRevision: string }) {
  const label = entry.kind === "previous" ? "Earlier edit" : entry.sourceRevision === currentSourceRevision ? "Current version" : "Earlier article revision";
  const savedAt = new Date(entry.savedAt).toLocaleString();
  return <details className="margin-accordion simplified-history-entry">
    <summary><span><strong>{label}</strong><small>{savedAt} · {entry.status}{entry.reviewed ? " · reviewed" : ""}</small></span><ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="margin-accordion-content"><pre>{entry.content}</pre></div>
  </details>;
}
