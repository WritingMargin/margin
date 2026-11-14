import { Copy, Download } from "lucide-react";
import { useDeploymentConfig } from "./useDeploymentConfig";
import InnerTabs from "../components/InnerTabs";
import "./DeploymentSettings.css";

export default function DeploymentSettings({
  publicUrl,
}: {
  publicUrl: string;
}) {
  const state = useDeploymentConfig(publicUrl);
  return (
    <section
      className="settings-card settings-guide deployment-settings"
      aria-labelledby="deployment-heading"
    >
      <h2 id="deployment-heading">Web server</h2>
      <p>
        Generate a config for <strong>{publicUrl || "your blog’s address"}</strong>.
      </p>
      <InnerTabs
        label="Web server"
        tabs={[
          { value: "nginx", label: "Nginx" },
          { value: "apache", label: "Apache" },
        ]}
        value={state.server}
        onChange={state.setServer}
        numbered={false}
        idPrefix="deployment-server-tab"
        panelId={() => "deployment-server-panel"}
      />
      <div
        id="deployment-server-panel"
        role="tabpanel"
        aria-labelledby={`deployment-server-tab-${state.server}`}
        tabIndex={0}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void state.generate();
          }}
        >
          <label>
            Engine address
            <input
              type="url"
              required
              maxLength={512}
              value={state.upstream}
              spellCheck={false}
              onChange={(event) => state.setUpstream(event.target.value)}
              aria-describedby="deployment-upstream-help"
            />
          </label>
          <p className="small-text" id="deployment-upstream-help">
            The address your web server uses to reach Margin.
          </p>
          <button className="button" disabled={state.busy || !publicUrl.trim()}>
            {state.busy ? "Generating…" : "Generate config"}
          </button>
        </form>
        {state.current?.error && (
          <p className="error-box" role="alert">
            {state.current.error}
          </p>
        )}
        {state.current?.data && (
          <div className="deployment-result">
            <div className="deployment-actions">
              <button
                type="button"
                className="button"
                onClick={() => void state.copy()}
              >
                <Copy size={14} />
                Copy config
              </button>
              <button type="button" className="button" onClick={state.download}>
                <Download size={14} />
                Download .conf
              </button>
            </div>
            <p className="small-text" role="status">
              {state.message}
            </p>
            <pre
              tabIndex={0}
              aria-label={`${state.server === "nginx" ? "Nginx" : "Apache"} configuration`}
            >
              <code>{state.current.data.config}</code>
            </pre>
            <p className="small-text">
              Follow the file’s setup comments, then run{" "}
              <code>{state.server === "nginx" ? "nginx -t" : "apachectl configtest"}</code>{" "}
              before reloading your web server.
            </p>
          </div>
        )}
        <p className="deployment-note">
          DNS and HTTPS must be configured separately.
        </p>
      </div>
    </section>
  );
}
