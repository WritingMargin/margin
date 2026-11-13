import { useState } from "react";
import { Globe2 } from "lucide-react";
import InnerTabs from "../components/InnerTabs";
import SettingsDisclosure from "./SettingsDisclosure";
import DeploymentSettings from "./DeploymentSettings";
import DomainDNSSettings from "./DomainDNSSettings";
import type { PublicationSettingsController } from "./usePublicationSettings";

const tabs = [
  { value: "domain", label: "Custom domain" },
  {
    value: "server",
    label: "Server configuration",
    shortLabel: "Server config",
  },
] as const;

export default function DomainSettings({
  state,
}: {
  state: PublicationSettingsController;
}) {
  const [tab, setTab] = useState<"domain" | "server">("domain");
  const publicUrl = state.url || state.saved?.domain.effectiveUrl || "";
  return (
    <SettingsDisclosure
      title="Domain & server setup"
      description="Change your public address, connect DNS, and configure Nginx or Apache."
      icon={<Globe2 />}
    >
      <InnerTabs
        label="Domain setup sections"
        tabs={tabs}
        value={tab}
        onChange={setTab}
        numbered={false}
        idPrefix="domain-setup-tab"
        panelId={(value) => `domain-setup-panel-${value}`}
      />
      <div
        id="domain-setup-panel-domain"
        role="tabpanel"
        aria-labelledby="domain-setup-tab-domain"
        hidden={tab !== "domain"}
        tabIndex={0}
      >
        <div className="publication-settings-grid">
          <DomainAddressForm state={state} />
          <DomainDNSSettings publicUrl={publicUrl} />
        </div>
      </div>
      <div
        id="domain-setup-panel-server"
        role="tabpanel"
        aria-labelledby="domain-setup-tab-server"
        hidden={tab !== "server"}
        tabIndex={0}
      >
        <p className="small-text">
          Configuration for <strong>{publicUrl || "your public URL"}</strong>.
          Set the address in Custom domain before generating.
        </p>
        <DeploymentSettings publicUrl={publicUrl} />
      </div>
    </SettingsDisclosure>
  );
}

function DomainAddressForm({
  state,
}: {
  state: PublicationSettingsController;
}) {
  return (
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
        Choose the public address readers and search engines should use for your
        blog. Use the DNS guide and the Server configuration tab to connect your
        domain before saving the new address.
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
          placeholder={
            state.saved?.domain.effectiveUrl || "https://blog.example.com"
          }
          maxLength={2048}
          value={state.url}
          onChange={(event) => state.setUrl(event.target.value)}
          aria-describedby="domain-help"
        />
        <p className="small-text" id="domain-help">
          Use an HTTPS address with your blog’s existing path, if any. Leave
          blank and save to restore the server’s configured address.
        </p>
        <div className="settings-actions">
          <button className="button primary" disabled={!state.domainDirty}>
            {state.busy ? "Saving…" : "Save address"}
          </button>
          {state.domainDirty && <span className="muted">Unsaved changes</span>}
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
        {!state.saved?.domain.url && (
          <p className="small-text">Using the server’s configured address.</p>
        )}
      </div>
    </form>
  );
}
