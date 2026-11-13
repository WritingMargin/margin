import { useEffect, useState } from "react";
import { api, APIError, json } from "../api";
import type { AccountStatus } from "./AccountGate";

export default function AccountAuthentication({ status, onConnected, restart, busy, error }: {
  status: AccountStatus;
  onConnected: (account: AccountStatus) => void;
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
        const account = await api<AccountStatus>("/account/connection", json("POST", {}));
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

  return <section className="settings-card" aria-label="Connect existing Margin Studio account">
    <h2>Sign in to Margin Studio</h2>
    <p><strong>{status.email}</strong> already has a Margin Studio account. Sign in there and approve connecting <strong>{status.blogUrl}</strong> to use its subscription and credits.</p>
    <p>Your Studio password stays in Studio. Your publication keeps its local login.</p>
    {expired ? <p>This sign-in request expired. Start again to get a new link.</p> : <>
      <a className="button primary" href={url} target="_blank" rel="noopener noreferrer">Sign in to Margin Studio</a>
      <p role="status">Waiting for approval. This page will connect automatically when you finish in Studio.</p>
    </>}
    {(error || problem) && <p className="error-box" role="alert">{error || problem}</p>}
    {expired && <button className="button" disabled={busy} onClick={() => void restart()}>{busy ? "Connecting…" : "Start again"}</button>}
  </section>;
}
