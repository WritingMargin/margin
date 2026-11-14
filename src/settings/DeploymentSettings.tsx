import { Copy, Download } from "lucide-react";
import { useDeploymentConfig } from "./useDeploymentConfig";
import InnerTabs from "../components/InnerTabs";
import "./DeploymentSettings.css";

type ConfigState = ReturnType<typeof useDeploymentConfig>;
export default function DeploymentSettings({ publicUrl, hosted = false, upstream = "" }: {
  publicUrl: string;
  hosted?: boolean;
  upstream?: string;
}) {
  const state = useDeploymentConfig(publicUrl, hosted, upstream);
  return <section className="settings-card settings-guide deployment-settings" aria-labelledby="deployment-heading">
    <h2 id="deployment-heading">{hosted ? "Nginx proxy" : "Web server"}</h2>
    <p>Generate a config for <strong>{publicUrl || "your blog’s address"}</strong>.</p>
    {!hosted && <InnerTabs label="Web server" tabs={[
      { value: "nginx", label: "Nginx" }, { value: "apache", label: "Apache" },
    ]} value={state.server} onChange={state.setServer} numbered={false}
      idPrefix="deployment-server-tab" panelId={() => "deployment-server-panel"} />}
    <div id="deployment-server-panel" role={hosted ? undefined : "tabpanel"}
      aria-labelledby={hosted ? undefined : `deployment-server-tab-${state.server}`} tabIndex={0}>
      <DeploymentForm state={state} publicUrl={publicUrl} hosted={hosted} />
      <DeploymentResult state={state} />
      <p className="deployment-note">DNS and HTTPS must be configured separately.</p>
    </div>
  </section>;
}

function DeploymentForm({ state, publicUrl, hosted }: { state: ConfigState; publicUrl: string; hosted: boolean }) {
  return <form onSubmit={event => { event.preventDefault(); void state.generate(); }}>
    <label>{hosted ? "Assigned Margin address" : "Engine address"}
      <input type="url" readOnly={hosted} required maxLength={512} value={state.upstream}
        spellCheck={false} onChange={event => state.setUpstream(event.target.value)} aria-describedby="deployment-upstream-help" />
    </label>
    <p className="small-text" id="deployment-upstream-help">The address your web server uses to reach Margin.</p>
    <button className="button" disabled={state.busy || !publicUrl.trim() || !state.upstream.trim()}>
      {state.busy ? "Generating…" : "Generate config"}
    </button>
  </form>;
}

function DeploymentResult({ state }: { state: ConfigState }) {
  if (state.current?.error) return <p className="error-box" role="alert">{state.current.error}</p>;
  if (!state.current?.data) return null;
  return <div className="deployment-result">
    <div className="deployment-actions">
      <button type="button" className="button" onClick={() => void state.copy()}><Copy size={14} />Copy config</button>
      <button type="button" className="button" onClick={state.download}><Download size={14} />Download .conf</button>
    </div>
    <p className="small-text" role="status">{state.message}</p>
    <pre tabIndex={0} aria-label={`${state.server === "nginx" ? "Nginx" : "Apache"} configuration`}><code>{state.current.data.config}</code></pre>
    <p className="small-text">Follow the file’s setup comments, then run <code>{state.server === "nginx" ? "nginx -t" : "apachectl configtest"}</code> before reloading your web server.</p>
  </div>;
}
