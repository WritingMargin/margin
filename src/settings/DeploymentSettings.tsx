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
    <div className="deployment-settings">
      <p>
        Use this when you manage the server running Margin. If your hosting
        provider manages the server, ask them to add your custom domain and
        enable HTTPS.
      </p>
      <ol className="deployment-steps">
        <li>
          Point your domain’s DNS to the web server using the Custom domain tab.
          For a blog on an existing website, keep that website’s DNS.
        </li>
        <li>
          Arrange an HTTPS certificate for the domain. The generated HTTPS site
          config expects the certificate files to already exist.
        </li>
        <li>
          Choose your web server and enter the engine address it can reach, then
          generate the config.
        </li>
      </ol>
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
              Review the comments for placement, engine settings, and
              validation. HTTPS site configs reference existing Let’s Encrypt
              certificates.
            </p>
            <InstallationSteps server={state.server} />
          </div>
        )}
        <p className="deployment-note">
          Set the engine’s PUBLIC_URL and proxy settings as shown in the
          generated comments, then restart the engine. Open your new HTTPS
          address and its /admin page to check they work before saving the
          address in Custom domain. Generating a template does not save your
          blog address or change DNS, certificates, or server configuration.
        </p>
      </div>
    </div>
  );
}

function InstallationSteps({ server }: { server: string }) {
  return (
    <p className="small-text">
      {server === "nginx" ? (
        <>
          For a complete site, install the config inside Nginx’s http context,
          for example in <code>/etc/nginx/conf.d/margin.conf</code>. Validate
          with <code>nginx -t</code>.
        </>
      ) : (
        <>
          For a complete site, include the config from Apache’s sites directory
          and enable the modules listed in its comments. Validate with{" "}
          <code>apachectl configtest</code>.
        </>
      )}{" "}
      For a /blog snippet, follow its placement comments inside your existing
      site configuration. Reload the web server only after validation succeeds.
    </p>
  );
}
