import { useEffect, useState } from "react";
import { api, json } from "../api";

type UpdateState = "idle" | "available" | "updating" | "updated" | "current" | "failed" | "unavailable";
type Software = { hosted: boolean; version?: string; state?: UpdateState };
const route = "/settings/software-update";
const messages: Record<UpdateState, string> = {
  idle: "Checking for a newer Margin release.",
  available: "A newer Margin release is available. Your blog may restart briefly when you update.",
  updating: "Updating Margin. This page will check again when your blog restarts.",
  updated: "Update complete. Your blog is running the new release.",
  current: "Your blog is running the latest stable release.",
  failed: "Central could not confirm the update. Try again or contact support.",
  unavailable: "Margin Central is unavailable. Check again in a moment.",
};
const buttonLabels: Partial<Record<UpdateState, string>> = {
  available: "Update Margin",
  failed: "Retry update",
  unavailable: "Check for updates",
};

export default function SoftwareUpdateSettings() {
  const [software, setSoftware] = useState<Software | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Software>(route).then(result => { if (active) setSoftware(result); }).catch(() => { if (active) setSoftware({ hosted: true, state: "unavailable" }); });
    return () => { active = false; };
  }, []);

  const updating = software?.state === "updating";
  useEffect(() => {
    if (!updating) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const retryUntil = Date.now() + 6 * 60_000;
    const poll = async () => {
      try {
        const next = await api<Software>(route);
        if (active && next.state !== "unavailable") {
          setSoftware(next);
          if (next.state !== "updating") return;
        }
      } catch { /* The blog can be temporarily offline while Hostlier replaces it. */ }
      if (active && Date.now() < retryUntil) timer = setTimeout(poll, 4000);
      else if (active) setSoftware(previous => previous && { ...previous, state: "unavailable" });
    };
    timer = setTimeout(poll, 4000);
    return () => { active = false; clearTimeout(timer); };
  }, [updating]);

  if (!software?.hosted) return null;
  const state = software.state || "unavailable";
  const buttonLabel = buttonLabels[state];
  const update = async () => {
    setBusy(true);
    setError("");
    try {
      setSoftware(await api<Software>(route, state === "unavailable" ? undefined : json("POST", {})));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach Margin Central.");
      setSoftware({ ...software, state: "unavailable" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-card">
      <h2>Software updates</h2>
      {software.version && <p>Installed version: {software.version}</p>}
      <p role="status">{messages[state]}</p>
      {error && <p className="error-box" role="alert">{error}</p>}
      {buttonLabel && (
        <button type="button" className="button" disabled={busy} onClick={update}>
          {buttonLabel}
        </button>
      )}
    </section>
  );
}
