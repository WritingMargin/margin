import { useEffect, useState, type ReactNode } from "react";
import { api, APIError, json } from "../api";
export type AccountAuthenticationStatus = {
  connected: boolean;
  email: string;
  blogUrl: string;
  authentication?: { url?: string; expiresAt?: string };
};

export default function AccountAuthentication<T extends AccountAuthenticationStatus>({ status, onConnected, restart, busy, error, connectionEndpoint = "/account/connection", heading = "Sign in to Margin", description }: {
  status: T;
  onConnected: (account: T) => void;
  restart: () => Promise<void>;
  busy: boolean;
  error: string;
  connectionEndpoint?: string;
  heading?: string;
  description?: ReactNode;
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
        const account = await api<T>(connectionEndpoint, json("POST", {}));
        if (!active) return;
        if (account.connected) { onConnected(account); return; }
        setProblem("");
      } catch (e) {
        if (!active) return;
        setProblem((e as Error).message);
        if (e instanceof APIError && ["ACCOUNT_AUTH_EXPIRED", "TEAM_AUTH_EXPIRED"].includes(e.code || "")) { setExpired(true); return; }
      }
      if (active) timer = setTimeout(() => void check(), 5000);
    }
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [url, onConnected, connectionEndpoint]);

  return <section className="settings-card" aria-label={heading}>
    <h2>{heading}</h2>
    <ConnectionDescription status={status} description={description} />
    {expired ? <p>This sign-in request expired. Start again to get a new link.</p> : <>
      <a className="button primary" href={url} target="_blank" rel="noopener noreferrer">Sign in to Margin</a>
      <p role="status">Waiting for approval. This page will connect automatically when you finish in Margin.</p>
    </>}
    {(error || problem) && <p className="error-box" role="alert">{error || problem}</p>}
    {expired && <button className="button" disabled={busy} onClick={() => void restart()}>{busy ? "Connecting…" : "Start again"}</button>}
  </section>;
}

function ConnectionDescription({ status, description }: { status: AccountAuthenticationStatus; description?: ReactNode }) {
  return description ?? <><p><strong>{status.email}</strong> already has a Margin account. Sign in and approve connecting <strong>{status.blogUrl}</strong> to use its subscription and credits.</p><p>Your publication keeps its local login.</p></>;
}
