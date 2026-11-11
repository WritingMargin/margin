import DeploymentSettings from "./DeploymentSettings";
import { Globe2 } from "lucide-react";
import type { PublicationSettingsController } from "./usePublicationSettings";

function deploymentAddress(state: PublicationSettingsController) {
  return state.url || state.saved?.domain.effectiveUrl || "";
}

export default function DomainSettings({
  state,
}: {
  state: PublicationSettingsController;
}) {
  return (
    <div className="publication-settings-grid">
      <form
        className="settings-card"
        onSubmit={(event) => {
          event.preventDefault();
          void state.save("domain");
        }}
      >
        <div className="settings-icon">
          <Globe2 />
        </div>
        <h2>Your blog’s address</h2>
        <p>
          Choose the public address readers and search engines should use for
          your blog.
        </p>
        <fieldset disabled={state.busy}>
          <label htmlFor="blog-domain">Public blog URL</label>
          <input
            id="blog-domain"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={state.saved?.domain.effectiveUrl || "https://blog.example.com"}
            maxLength={2048}
            value={state.url}
            onChange={(event) => state.setUrl(event.target.value)}
            aria-describedby="domain-help"
          />
          <p className="small-text" id="domain-help">
            Use an HTTPS address with your blog’s existing path, if any.
            Leave blank and save to restore the server’s configured address.
          </p>
          <div className="settings-actions">
            <button className="button primary" disabled={!state.domainDirty}>
              {state.busy ? "Saving…" : "Save address"}
            </button>
            {state.domainDirty && (
              <span className="muted">Unsaved changes</span>
            )}
          </div>
        </fieldset>
        <div className="settings-current-address">
          <span>Current public address</span>
          <a
            href={state.saved?.domain.effectiveUrl}
            target="_blank"
            rel="noreferrer"
          >
            {state.saved?.domain.effectiveUrl}
          </a>
          {!state.saved?.domain.url && <p className="small-text">Using the server’s configured address.</p>}
        </div>
      </form>
      <DeploymentSettings publicUrl={deploymentAddress(state)} />
    </div>
  );
}
