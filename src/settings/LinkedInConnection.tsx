import { useEffect, useState } from "react";
import { api, json } from "../api";
import { Linkedin } from "lucide-react";
import SettingsDisclosure from "./SettingsDisclosure";

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
    <SettingsDisclosure
      title="LinkedIn personal profile"
      description="Share published articles with your LinkedIn audience."
      icon={<Linkedin />}
      status={connectionLabel(status, error)}
    >
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
    </SettingsDisclosure>
  );
}

function connectionLabel(status: Status | undefined, error: string) {
  if (error) return "Connection needs attention";
  if (!status) return "Checking connection…";
  return status.connected ? "Connected" : "Not connected";
}
