import { useEffect, useState } from "react";
import { api, json } from "../api";

type Status = { available: boolean; connected: boolean; name: string };
const path = "/settings/publishing/linkedin";
export default function LinkedInConnection() {
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<Status>(path, { signal: controller.signal })
      .then(setStatus)
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, []);
  async function connect() {
    setBusy(true);
    setError("");
    try {
      if (status?.connected) {
        await api(path + "/disconnect", json("POST", {}));
        setStatus({ ...status, connected: false, name: "" });
      } else {
        const result = await api<{ url: string }>(
          path + "/connect",
          json("POST", {}),
        );
        window.location.assign(result.url);
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <h2>LinkedIn personal profile</h2>
      <p>
        Review and publish a public LinkedIn post from a published article’s SEO
        &amp; sharing tab.
      </p>
      {status?.connected && (
        <p>
          Connected as <strong>{status.name}</strong>
        </p>
      )}
      {status &&
        (status.connected || status.available ? (
          <button className="button" disabled={busy} onClick={connect}>
            {status.connected ? "Disconnect LinkedIn" : "Connect LinkedIn"}
          </button>
        ) : (
          <p>
            Configure the LinkedIn publishing app on this installation to enable
            connections.
          </p>
        ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
