import { useEffect, useState } from "react";
import { api, APIError, json } from "../api";
import "./AccountAuthentication.css";
export type AccountAuthenticationStatus = {
  connected: boolean;
  email: string;
  blogUrl: string;
  authentication?: { url?: string; expiresAt?: string };
};

export default function AccountAuthentication<T extends AccountAuthenticationStatus>({ status, onConnected, restart, busy, error }: {
  status: T;
  onConnected: (account: T) => void;
  restart: () => Promise<void>;
  busy: boolean;
  error: string;
}) {
  const [problem, setProblem] = useState("");
  const [expired, setExpired] = useState(false);
  const url = status.authentication?.url;
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setExpired(false);
    setProblem("");
    async function check() {
      try {
        const account = await api<T>("/account/connection", json("POST", {}));
        if (!active) return;
        if (account.connected) { onConnected(account); return; }
        setProblem("");
      } catch (e) {
        if (!active) return;
        setProblem((e as Error).message);
        if (e instanceof APIError && e.code === "ACCOUNT_AUTH_EXPIRED") { setExpired(true); return; }
      }
      if (active) timer = setTimeout(() => void check(), 5000);
    }
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [url, onConnected]);

  return <section className="settings-card" aria-label="Sign in to Margin">
    <h2>Sign in to Margin</h2>
    <div className="account-connection-copy"><ConnectionDescription status={status} /></div>
    {expired ? <p>This sign-in request expired. Start again to get a new link.</p> : <>
      <div className="settings-actions"><a className="button primary" href={url} target="_blank" rel="noopener noreferrer">Sign in to Margin</a></div>
      <p className="small-text account-connection-status" role="status">Waiting for approval. This page will connect automatically when you finish in Margin.</p>
    </>}
    {(error || problem) && <p className="error-box" role="alert">{error || problem}</p>}
    {expired && <div className="settings-actions"><button className="button" disabled={busy} onClick={() => void restart()}>{busy ? "Connecting…" : "Start again"}</button></div>}
  </section>;
}

function ConnectionDescription({ status }: { status: AccountAuthenticationStatus }) {
  return <><p><strong>{status.email}</strong> already has a Margin account. Sign in and approve connecting <strong>{status.blogUrl}</strong> to use its subscription and credits.</p><p>Your publication keeps its local login.</p></>;
}
