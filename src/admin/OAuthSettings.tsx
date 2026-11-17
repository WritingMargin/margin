import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { api } from "../api";
import Accordion from "../Accordion";
import Empty from "../components/Empty";
import { loadOAuthSettings, type OAuthConnection, type OAuthClient } from "./oauth-connections";

export default function OAuthSettings({ primaryOwner = false }: { primaryOwner?: boolean }) {
  const [connections, setConnections] = useState<OAuthConnection[]>([]);
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const data = await loadOAuthSettings(primaryOwner, signal);
    if (signal?.aborted) return;
    setConnections(data.connections);
    setClients(data.clients);
  }, [primaryOwner]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void refresh(controller.signal).catch((e: Error) => {
      if (!controller.signal.aborted) setError(e.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh, attempt]);
  const revoke = async (kind: "connections" | "clients", id: string) => {
    setBusy(id); setError("");
    try {
      await api(`/oauth/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };
  return <section className="settings-card">
    <div className="settings-icon"><Plug /></div>
    <h2>OAuth connections</h2>
    <p>These apps are connected to your account in this publication. Each app can only use the permissions you approved within your current publication access.</p>
    {error && <p className="error-box" role="alert">{error} <button className="button" disabled={Boolean(busy)} onClick={() => setAttempt(value => value + 1)}>Try again</button></p>}
    <ConnectionsList connections={connections} loading={loading} error={error} busy={busy} revoke={id => void revoke("connections", id)} />
    {primaryOwner && <RegisteredClients clients={clients} busy={busy} revoke={id => void revoke("clients", id)} />}
  </section>;
}
function ConnectionsList({ connections, loading, error, busy, revoke }: { connections: OAuthConnection[]; loading: boolean; error: string; busy: string; revoke: (id: string) => void }) {
  if (loading) return <p role="status">Loading connections…</p>;
  if (!connections.length) return error ? null : <Empty icon={<Plug size={25} strokeWidth={1.4} />} title="No connected apps." text="Add the MCP server URL to your client and follow its OAuth sign-in flow to connect." />;
  return <>{connections.map(app => <div key={app.id}>
    <p><strong>{app.name}</strong><br /><small>Connected {new Date(app.grantedAt).toLocaleDateString()}</small></p>
    <ul>{(app.permissions ?? [app.role]).map(permission => <li key={permission}>{permission}</li>)}</ul>
    <button className="button" disabled={Boolean(busy)} onClick={() => revoke(app.id)}>
      {busy === app.id ? "Revoking…" : "Revoke access"}
    </button>
  </div>)}</>;
}
function RegisteredClients({ clients, busy, revoke }: { clients: OAuthClient[]; busy: string; revoke: (id: string) => void }) {
  if (!clients.length) return null;
  return <Accordion title={`Registered clients (${clients.length})`}>
    <p>Registration alone grants no access. Remove a client to invalidate its registration and all its tokens.</p>
    {clients.map(client => <div key={client.id}>
      <p><strong>{client.name}</strong><br /><small style={{ overflowWrap: "anywhere" }}>{client.redirectUris.join(", ")}</small></p>
      <button className="button" disabled={Boolean(busy)} onClick={() => revoke(client.id)}>{busy === client.id ? "Removing…" : "Remove client"}</button>
    </div>)}
  </Accordion>;
}
