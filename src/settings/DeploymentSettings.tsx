import { Copy, Download, Server } from "lucide-react";
import { useDeploymentConfig } from "./useDeploymentConfig";
import SettingsDisclosure from "./SettingsDisclosure";
import "./DeploymentSettings.css";

export default function DeploymentSettings({
  publicUrl,
}: {
  publicUrl: string;
}) {
  const state = useDeploymentConfig(publicUrl);
  return (
    <SettingsDisclosure
      className="deployment-settings"
      title="Configure your web server"
      description="Generate a reverse-proxy configuration for your blog’s address."
      icon={<Server />}
      status={
        state.current?.error ? "Configuration needs attention" : undefined
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void state.generate();
        }}
      >
        <div className="settings-tabs" role="group" aria-label="Web server">
          {(["nginx", "apache"] as const).map((server) => (
            <button
              key={server}
              type="button"
              aria-pressed={state.server === server}
              onClick={() => state.setServer(server)}
            >
              {server === "nginx" ? "Nginx" : "Apache"}
            </button>
          ))}
        </div>
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
          The HTTP address reachable by your proxy. For Docker, use the mapped
          host port or container service name.
        </p>
        <button className="button" disabled={state.busy || !publicUrl.trim()}>
          {state.busy ? "Generating…" : "Generate config"}
        </button>
      </form>
      <p className="small-text">
        A root URL generates a site config. A path such as /blog generates a
        snippet for your existing site.
      </p>
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
            Review the comments for placement, engine settings, and validation.
            HTTPS site configs reference existing Let’s Encrypt certificates.
          </p>
        </div>
      )}
      <p className="deployment-note">
        Apply the config on your server, validate it, then reload your proxy.
        Generating a template does not save your blog address or change DNS,
        certificates, or server configuration.
      </p>
    </SettingsDisclosure>
  );
}
