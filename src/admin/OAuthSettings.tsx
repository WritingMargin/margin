import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { api } from "../api";
import SettingsDisclosure from "../settings/SettingsDisclosure";

type Connection = { id: string; name: string; role: string; permissions?: string[]; grantedAt: string };
type Client = { id: string; name: string; clientId: string; redirectUris: string[] };

export default function OAuthSettings() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const refresh = useCallback(async () => {
    const [apps, registered] = await Promise.all([
      api<Connection[]>("/oauth/connections"), api<Client[]>("/oauth/clients"),
    ]);
    setConnections(apps);
    setClients(registered);
  }, []);
  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [refresh]);
  const revoke = async (kind: "connections" | "clients", id: string) => {
    setBusy(id); setError("");
    try {
      await api(`/oauth/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(""); }
  };
  return <SettingsDisclosure
    title="OAuth connections"
    description="Manage apps connected through OAuth and their permissions."
    icon={<Plug />}
    status={loading ? "Checking connections…" : error ? "Connection needs attention" : `${connections.length} connected ${connections.length === 1 ? "app" : "apps"}`}
  >
    <p>Connect an MCP or API client through its OAuth sign-in flow. Review its requested permissions before approving access.</p>
    {error && <p className="error-box" role="alert">{error}</p>}
    {loading ? <p>Loading connections…</p> : connections.length === 0 && <p>No connected apps.</p>}
    {connections.map((app) => <div className="oauth-connection-row" key={app.id}><div className="oauth-connection-copy">
      <p><strong>{app.name}</strong><br /><small>Connected {new Date(app.grantedAt).toLocaleDateString()}</small></p>
      <ul>{(app.permissions ?? [app.role]).map(permission => <li key={permission}>{permission}</li>)}</ul></div>
      <button className="button" disabled={Boolean(busy)} onClick={() => void revoke("connections", app.id)}>
        {busy === app.id ? "Revoking…" : "Revoke access"}
      </button>
    </div>)}
    {clients.length > 0 && <details className="oauth-clients margin-accordion"><summary>Registered clients ({clients.length})</summary>
      <p>Registration alone grants no access. Remove a client to invalidate its registration and all its tokens.</p>
      {clients.map((client) => <div className="oauth-connection-row" key={client.id}>
        <p className="oauth-connection-copy"><strong>{client.name}</strong><br /><small style={{ overflowWrap: "anywhere" }}>{client.redirectUris.join(", ")}</small></p>
        <button className="button" disabled={Boolean(busy)} onClick={() => void revoke("clients", client.id)}>Remove client</button>
      </div>)}
    </details>}
  </SettingsDisclosure>;
}
