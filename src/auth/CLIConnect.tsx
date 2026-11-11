import { useState } from "react";
import { Terminal } from "lucide-react";
import { api, json } from "../api";
import { sitePath } from "../base-path";
import "./CLIConnect.css";

export default function CLIConnect({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const approve = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/tokens/cli/approve", json("POST", { code }));
      setConnected(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page-content cli-connect">
      <section className="settings-card" aria-labelledby="cli-connect-title">
        <div className="settings-icon"><Terminal /></div>
        <h1 id="cli-connect-title">{connected ? "Your CLI is connected." : "Connect your CLI"}</h1>
        {connected ? <p>Return to your terminal to start writing. You can revoke this connection in Settings → Integrations.</p> : <>
          <p>Only approve if you ran <code>margin login</code> and this code matches the one in your terminal.</p>
          <p><strong className="cli-connect-code">{code}</strong></p>
          <p>This grants the CLI owner access, including reading drafts, publishing, and deleting posts.</p>
          {error && <p className="error-box" role="alert">{error}</p>}
          <button className="button primary" disabled={busy} onClick={() => void approve()}>
            {busy ? "Connecting…" : "Approve connection"}
          </button>
        </>}
        <p><a href={sitePath("/admin/settings?tab=integrations")}>{connected ? "Back to settings" : "Cancel"}</a></p>
      </section>
    </main>
  );
}
