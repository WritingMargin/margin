import { useEffect, useState } from "react";
import { BookOpenText } from "lucide-react";
import { api, json } from "../api";
import type { AIConfig } from "../../shared/ai";

type Settings = { enabled: boolean };

function useSimplifiedSettings(onDirtyChange: (dirty: boolean) => void) {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [ai, setAI] = useState<AIConfig | null>(null);
  const [accountConnected, setAccountConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    api<Settings>("/settings/simplified").then(settings => {
      if (!active) return;
      setSaved(settings); setEnabled(settings.enabled);
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Could not load Simplified settings."); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const refreshAccount = () => {
      void Promise.allSettled([api<AIConfig>("/ai/config"), api<{ connected: boolean }>("/account")]).then(([config, account]) => {
        if (!active) return;
        setAI(config.status === "fulfilled" ? config.value : null);
        setAccountConnected(account.status === "fulfilled" ? account.value.connected : null);
      });
    };
    refreshAccount();
    window.addEventListener("margin:account-connected", refreshAccount);
    return () => { active = false; window.removeEventListener("margin:account-connected", refreshAccount); };
  }, []);
  const dirty = saved !== null && enabled !== saved.enabled;
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  async function save() {
    setBusy(true); setMessage("");
    try {
      setSaved(await api<Settings>("/settings/simplified", json("PUT", { enabled })));
      setMessage("Simplified article settings saved.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return { saved, enabled, setEnabled, ai, accountConnected, busy, message, dirty, save };
}

type State = ReturnType<typeof useSimplifiedSettings>;

export default function SimplifiedSettings({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const state = useSimplifiedSettings(onDirtyChange);
  return <section className="settings-card simplified-settings">
    <div className="settings-icon"><BookOpenText aria-hidden="true" /></div>
    <h2>Simplified articles</h2>
    <p className="muted">Give readers a shorter version of each published article. Margin generates a fresh version whenever you publish a new article revision. You can review and edit it from the article editor.</p>
    <SimplifiedFeature state={state} />
    <SimplifiedSavebar state={state} />
  </section>;
}

function priceText(cost: number | undefined) {
  if (cost === undefined) return "Each published revision uses credits.";
  return `${cost} ${cost === 1 ? "credit" : "credits"} per published revision. Failed generations return their credits.`;
}

function SimplifiedFeature({ state }: { state: State }) {
  const available = !!state.ai?.features.simplified;
  return <>
    <div className="reader-feature">
      <span className="reader-feature-icon" aria-hidden="true"><BookOpenText /></span>
      <div><h3>Generate Simplified versions</h3><p>{priceText(state.ai?.costs?.simplified)}</p></div>
      <label className="reader-switch"><input aria-label="Generate Simplified versions" type="checkbox" role="switch" checked={state.enabled} disabled={!state.saved || state.busy || (!available && !state.enabled)} onChange={event => state.setEnabled(event.target.checked)} /></label>
    </div>
    <SimplifiedPolicyNote enabled={!!state.saved?.enabled} />
    {state.accountConnected === false && <p className="small-text">Connect a Margin account to generate new Simplified versions and see the current credit cost.</p>}
  </>;
}

function SimplifiedPolicyNote({ enabled }: { enabled: boolean }) {
  return <p className="small-text">{enabled
    ? "Turning this off stops future generation. Published Simplified versions remain available until you hide them in the article editor."
    : "Enabling this applies to future published revisions. Existing articles are not generated automatically."}</p>;
}

function saveStatus(state: State) {
  if (state.message) return state.message;
  if (state.dirty) return "Unsaved changes";
  return state.saved ? "All changes saved" : "Loading Simplified settings…";
}

function SimplifiedSavebar({ state }: { state: State }) {
  const unavailable = state.enabled && !state.ai?.features.simplified;
  return <div className="reader-savebar"><span role="status">{saveStatus(state)}</span><button type="button" className="button primary" disabled={!state.dirty || state.busy || unavailable} onClick={() => void state.save()}>{state.busy ? "Saving…" : "Save Simplified settings"}</button></div>;
}
