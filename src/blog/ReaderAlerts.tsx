import { useEffect, useState } from "react";
import { api, json } from "../api";
import { sitePath } from "../base-path";
import type { CommentAuth } from "./useCommentAuth";
import ReaderAuth from "./ReaderAuth";
import "./reader-alerts.css";

type ReaderAlert = { id: string; kind: string; text: string; url: string; read: boolean; createdAt: string };
type AlertPage = { alerts: ReaderAlert[]; hasMore: boolean };
type AlertSettings = { emailEnabled: boolean };

export default function ReaderAlerts({ auth }: { auth: CommentAuth }) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<AlertPage | null>(null);
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!auth.reader) return;
    let active = true;
    Promise.all([
      api<AlertPage>(`/public/reader-alerts?offset=${offset}`),
      api<AlertSettings>("/public/reader-alerts/settings"),
    ]).then(([alerts, preferences]) => {
      if (active) { setPage(alerts); setSettings(preferences); setError(""); }
    }).catch((cause) => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [auth.reader, offset, version]);
  if (!auth.reader) return <ReaderAuth auth={auth} prompt="Sign in to see your alerts." />;
  async function toggleEmail() {
    if (!settings || busy) return;
    setBusy(true);
    try {
      setSettings(await api<AlertSettings>("/public/reader-alerts/settings", json("PUT", { emailEnabled: !settings.emailEnabled })));
      setError("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function markRead(id: string) {
    try {
      await api(`/public/reader-alerts/${id}`, json("PATCH", { read: true }));
      setVersion((current) => current + 1);
    } catch (cause) { setError((cause as Error).message); }
  }
  return <section className="reader-alerts" aria-label="Your alerts">
    <p className="reader-alerts-intro">Replies and changes to passages you noted.</p>
    {settings && <label className="reader-alert-email"><input type="checkbox" checked={settings.emailEnabled} disabled={busy} onChange={() => void toggleEmail()} /><span>Email alerts</span></label>}
    {error && <p role="alert">{error}</p>}
    {!page && !error && <p role="status">Loading alerts…</p>}
    {page && <>
      {!page.alerts.length && <p className="reader-alert-empty">No alerts yet.</p>}
      <div className="reader-alert-list">{page.alerts.map((alert) => <article key={alert.id} data-read={alert.read}>
        <div><p>{alert.text}</p><time dateTime={alert.createdAt}>{new Date(alert.createdAt).toLocaleDateString()}</time></div>
        <div className="reader-alert-actions">{safeAlertPath(alert.url) && <a href={sitePath(alert.url)}>Open</a>}{!alert.read && <button type="button" onClick={() => void markRead(alert.id)}>Mark read</button>}</div>
      </article>)}</div>
      {(offset > 0 || page.hasMore) && <nav className="reader-alert-pages" aria-label="Alert pages"><button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button><span>Page {Math.floor(offset / 20) + 1}</span><button type="button" disabled={!page.hasMore} onClick={() => setOffset(offset + 20)}>Next</button></nav>}
    </>}
  </section>;
}

function safeAlertPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}
