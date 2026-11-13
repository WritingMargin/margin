import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Users } from "lucide-react";
import { api, json } from "../api";
import AccountGate from "../auth/AccountGate";
import AccountAuthentication, { type AccountAuthenticationStatus } from "../auth/AccountAuthentication";
import { useTeamIdentity } from "../auth/TeamContext";

type TeamConnectionStatus = AccountAuthenticationStatus;

export default function TeamConnection({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TeamConnectionStatus | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    api<TeamConnectionStatus>("/team/connection", { signal: request.signal })
      .then(value => { if (!request.signal.aborted) { setStatus(value); setError(""); } })
      .catch(cause => { if (!request.signal.aborted) setError(cause.message); });
    return () => request.abort();
  }, [attempt]);
  if (!status) return <section className="settings-card">
    <div className="settings-icon"><Users /></div><h2>Your publication team</h2>
    {error ? <><p className="error-box" role="alert">{error}</p><button className="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Try again</button></> : <p role="status">Checking your publication’s team connection…</p>}
  </section>;
  if (status.connected) return children;
  return <AccountGate feature="Team invitations"><ConnectTeam initial={status} /></AccountGate>;
}

function ConnectTeam({ initial }: { initial: TeamConnectionStatus }) {
  const { primaryOwner } = useTeamIdentity();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const acceptConnection = useCallback((result: TeamConnectionStatus) => {
    setStatus(result);
    if (result.connected) location.reload();
  }, []);
  async function connect() {
    setBusy(true); setError("");
    try { acceptConnection(await api<TeamConnectionStatus>("/team/connection", json("POST", { consent: true }))); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  if (!primaryOwner) return <section className="settings-card"><h2>Your publication team</h2><p>The publication’s primary owner needs to connect a Margin account before inviting teammates.</p></section>;
  if (status.authentication?.url) return <AccountAuthentication
    status={status} onConnected={acceptConnection} restart={connect} busy={busy} error={error}
    connectionEndpoint="/team/connection/complete"
    heading="Connect your publication team"
    description={<><p>Sign in to your Margin account and approve team access for <strong>{status.blogUrl}</strong>.</p><p>Your existing owner login stays available. Teammates sign in with their own Margin accounts and receive access only to this publication.</p><ReviewInvitationNotice /></>}
  />;
  return <section className="settings-card">
    <div className="settings-icon"><Users /></div><h2>Your publication team</h2>
    <p>Connect your Margin account to invite teammates. Each person’s role and article access apply only to this publication.</p>
    <p>Your existing owner login stays available.</p>
    <ReviewInvitationNotice />
    {error && <p className="error-box" role="alert">{error}</p>}
    <button className="button primary" disabled={busy} onClick={() => void connect()}>{busy ? "Connecting…" : "Connect team access"}</button>
  </section>;
}

function ReviewInvitationNotice() {
  return <p>After connecting, resend any existing peer-review invitations so reviewers can accept with their Margin accounts. Your drafts and review notes are preserved.</p>;
}
