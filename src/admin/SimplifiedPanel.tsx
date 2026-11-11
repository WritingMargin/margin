import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { api, json } from "../api";
import { sitePath } from "../base-path";
import { useOverlayFocus } from "../useOverlayFocus";
import type { Post } from "../../shared/types";
import "./dialog-layout.css";
import "./post-details.css";
import "./simplified-panel.css";
import SimplifiedHistory from "./SimplifiedHistory";

type Version = {
  postId: string;
  sourceRevision: string;
  writerRevision: string;
  status: "unavailable" | "queued" | "generating" | "ready" | "failed" | "hidden";
  content: string;
  reviewed: boolean;
  error: string;
};

function useSimplifiedVersion(post: Post) {
  const [version, setVersion] = useState<Version | null>(null);
  const [content, setContent] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    if (!post.id) return;
    try {
      const value = await api<Version>(`/posts/${post.id}/simplified`);
      setVersion(value); setContent(value.content); setReviewed(value.reviewed);
      setHidden(value.status === "hidden"); setMessage("");
    } catch (error) { setMessage((error as Error).message); }
  }
  useEffect(() => { void refresh(); }, [post.id, post.revision]);
  async function save() {
    if (!version) return;
    setBusy(true); setMessage("");
    try {
      const value = await api<Version>(`/posts/${post.id}/simplified`, json("PUT", {
        sourceRevision: version.sourceRevision, writerRevision: version.writerRevision,
        content, reviewed, hidden,
      }));
      setVersion(value); setMessage("Simplified version saved.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function retry() {
    setBusy(true); setMessage("");
    try {
      setVersion(await api<Version>(`/posts/${post.id}/simplified/retry`, json("POST", {})));
      setMessage("Generation queued. Refresh in a moment.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function generate() {
    setBusy(true); setMessage("");
    try {
      setVersion(await api<Version>(`/posts/${post.id}/simplified/generate`, json("POST", {})));
      setMessage("Generation queued. This uses the published revision’s credit charge.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return { version, content, setContent, reviewed, setReviewed, hidden, setHidden, busy, message, refresh, save, retry, generate };
}

type State = ReturnType<typeof useSimplifiedVersion>;

export default function SimplifiedPanel({ post, close }: { post: Post; close: () => void }) {
  const panel = useRef<HTMLElement>(null);
  useOverlayFocus(panel, true, close);
  const state = useSimplifiedVersion(post);
  return <div className="modal-backdrop simplified-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} className="modal post-details-modal simplified-modal editor-button-surface" role="dialog" aria-modal="true" aria-labelledby="simplified-title" aria-describedby="simplified-intro">
      <button type="button" className="modal-close icon-button" aria-label="Close Simplified version" onClick={close}><X size={18} /></button>
      <header className="dialog-header"><span className="eyebrow">ARTICLE VIEW</span><h2 id="simplified-title">Simplified version</h2><p id="simplified-intro">Review the shorter version for accuracy, then mark it reviewed. Changes here do not edit the full article.</p></header>
      <SimplifiedBody post={post} state={state} />
      <SimplifiedFooter post={post} state={state} />
    </section>
  </div>;
}

function SimplifiedBody({ post, state }: { post: Post; state: State }) {
  if (!post.id || post.status !== "published")
    return <div className="dialog-body simplified-panel-body"><p>Publish this article to generate its Simplified version.</p></div>;
  const version = state.version;
  return <div className="dialog-body simplified-panel-body">
    <VersionStatus state={state} version={version} />
    <SimplifiedControls state={state} />
    <SimplifiedHistory key={version?.writerRevision || post.revision} postId={post.id} currentSourceRevision={post.revision || ""} />
  </div>;
}

function VersionStatus({ state, version }: { state: State; version: Version | null }) {
  return <>
    <div className="simplified-panel-status"><span>Status</span><strong>{version?.status ?? "Loading…"}</strong><button type="button" className="button" disabled={state.busy} onClick={() => void state.refresh()}>Refresh</button></div>
    <VersionError version={version} />
    {version?.status === "failed" && <button type="button" className="button" disabled={state.busy} onClick={() => void state.retry()}>Retry generation</button>}
    {version?.status === "unavailable" && <><p>Enable Simplified articles in Readers settings, then generate this published article or wait until its next revision.</p><button type="button" className="button" disabled={state.busy} onClick={() => void state.generate()}>Generate for this article</button></>}
    {state.message && <p role="status">{state.message}</p>}
  </>;
}

function VersionError({ version }: { version: Version | null }) {
  return version?.status === "failed" && version.error ? <p role="alert" className="error-box">{version.error}</p> : null;
}

function SimplifiedControls({ state }: { state: State }) {
  const version = state.version;
  if (!version || (version.status !== "ready" && version.status !== "hidden")) return null;
  return <>
    <label htmlFor="simplified-content" className="sr-only">Simplified article text</label>
    <textarea id="simplified-content" value={state.content} onChange={event => state.setContent(event.target.value)} maxLength={16000} rows={8} />
    <div className="simplified-panel-options">
      <label className="simplified-panel-check"><input type="checkbox" checked={state.reviewed} onChange={event => state.setReviewed(event.target.checked)} /><span className="simplified-check-box" aria-hidden="true"><Check size={15} /></span><span>Reviewed by the writer</span></label>
      <label className="simplified-panel-check"><input type="checkbox" checked={state.hidden} onChange={event => state.setHidden(event.target.checked)} /><span className="simplified-check-box" aria-hidden="true"><Check size={15} /></span><span>Hide from readers</span></label>
    </div>
  </>;
}

function SimplifiedFooter({ post, state }: { post: Post; state: State }) {
  const version = state.version;
  if (!canShowSimplifiedFooter(post, version)) return null;
  return <footer className="dialog-footer simplified-panel-footer">
    {version.status === "ready" && <a className="button simplified-public-link" href={sitePath(`/post/${encodeURIComponent(post.slug)}/simplified`)} target="_blank" rel="noopener noreferrer">View public version <ExternalLink size={14} aria-hidden="true" /></a>}
    <button type="button" className="button primary" disabled={!canSaveSimplified(state, version)} onClick={() => void state.save()}>{state.busy ? "Saving…" : "Save version"}</button>
  </footer>;
}

function canShowSimplifiedFooter(post: Post, version: Version | null): version is Version {
  return !!post.id && post.status === "published" && !!version && (version.status === "ready" || version.status === "hidden");
}

function canSaveSimplified(state: State, version: Version) {
  const dirty = state.content !== version.content || state.reviewed !== version.reviewed || state.hidden !== (version.status === "hidden");
  return dirty && !state.busy && !!state.content.trim();
}
