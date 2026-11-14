import { Globe2 } from "lucide-react";
import InnerTabs from "../components/InnerTabs";
import SettingsDisclosure from "./SettingsDisclosure";
import DeploymentSettings from "./DeploymentSettings";
import DomainDNSSettings from "./DomainDNSSettings";
import { setupAddress } from "./domain-url";
import type { PublicationSettingsController } from "./usePublicationSettings";
import "./domain-setup.css";

const tabs = [
  { value: "dns", label: "DNS record" },
  { value: "proxy", label: "Nginx proxy" },
] as const;

export default function DomainSettings({ state, cloudManaged = false }: {
  state: PublicationSettingsController;
  cloudManaged?: boolean;
}) {
  const currentUrl = state.saved?.domain.effectiveUrl || "";
  const publicUrl = state.url.trim() ? setupAddress(state.url, currentUrl) : currentUrl;
  const upstream = state.saved?.domain.hosting?.assignedUrl || "";
  return <SettingsDisclosure
    title="Domain & server setup"
    description="Enter your public address, then follow the setup instructions."
    icon={<Globe2 />}
  >
    <div className="publication-settings-grid domain-setup">
      <DomainAddressForm state={state} cloudManaged={cloudManaged} />
      {cloudManaged
        ? <HostedDomainSetup state={state} publicUrl={publicUrl} upstream={upstream} />
        : <DeploymentSettings publicUrl={publicUrl} />}
    </div>
  </SettingsDisclosure>;
}

function HostedDomainSetup({ state, publicUrl, upstream }: { state: PublicationSettingsController; publicUrl: string; upstream: string }) {
  const tab = state.domainMode;
  return <div className="domain-setup-instructions">
    <InnerTabs label="Hosted domain setup" tabs={tabs} value={tab} onChange={state.setDomainMode}
      numbered={false} idPrefix="domain-setup-tab"
      panelId={value => `domain-setup-panel-${value}`} />
    <div id="domain-setup-panel-dns" role="tabpanel" aria-labelledby="domain-setup-tab-dns" hidden={tab !== "dns"} tabIndex={0}>
      <DomainDNSSettings publicUrl={publicUrl} targetUrl={upstream} />
    </div>
    <div id="domain-setup-panel-proxy" role="tabpanel" aria-labelledby="domain-setup-tab-proxy" hidden={tab !== "proxy"} tabIndex={0}>
      <DeploymentSettings publicUrl={publicUrl} hosted upstream={upstream} />
    </div>
  </div>;
}

function DomainAddressForm({ state, cloudManaged }: { state: PublicationSettingsController; cloudManaged: boolean }) {
  return <form className="domain-address-form" onSubmit={event => {
    event.preventDefault();
    void state.save("domain");
  }}>
    <fieldset disabled={state.busy}>
      <label htmlFor="blog-domain">Public blog URL</label>
      <div className="domain-address-row">
      <input id="blog-domain" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder={state.saved?.domain.effectiveUrl || "https://blog.example.com"} maxLength={2048}
        value={state.url} onChange={event => state.setUrl(event.target.value)} aria-describedby="domain-help" />
      <DomainSaveControls state={state} cloudManaged={cloudManaged} />
      </div>
      <p className="small-text" id="domain-help">For example: blog.example.com or example.com/blog.</p>
      {state.domainPathChanged && <p className="small-text">Apply the generated config and restart Margin, then save this address.</p>}
    </fieldset>
    {cloudManaged && <HostedDomainStatus state={state} />}
    <div className="domain-current-address">
      <span>Current:</span>
      <a href={state.saved?.domain.effectiveUrl} target="_blank" rel="noreferrer">{state.saved?.domain.effectiveUrl}</a>
    </div>
  </form>;
}

function DomainSaveControls({ state, cloudManaged }: { state: PublicationSettingsController; cloudManaged: boolean }) {
  const disabled = domainSaveDisabled(state, cloudManaged);
  const label = domainActionLabel(state);
  return <button className="button primary" disabled={disabled}>{label}</button>;
}

function HostedDomainStatus({ state }: { state: PublicationSettingsController }) {
  const hosting = state.saved?.domain.hosting;
  if (hosting?.status === "ready") return null;
  return <div className="domain-hosting-status">
    <p className="small-text" role="status">{hosting?.message || hostedStatusMessage(hosting?.status)}</p>
    <HostingRetry state={state} />
    {hosting?.status === "applying" && <div className="settings-actions">
      <button type="button" className="button" disabled={state.busy} onClick={() => void state.refreshDomain()}>Check status</button>
      {hosting.requestedUrl && <a className="button" href={hosting.requestedUrl} target="_blank" rel="noreferrer">Open requested address</a>}
    </div>}
  </div>;
}
function hostedStatusMessage(status: string | undefined) {
  if (status === "pending_dns") return "Add the DNS record below, then check DNS.";
  if (status === "applying") return "Applying your address. Setup is still in progress.";
  if (status === "failed") return "Address setup failed. Try saving again.";
  return "Domain setup is currently unavailable.";
}

function domainSaveDisabled(state: PublicationSettingsController, hosted: boolean) {
  const status = state.saved?.domain.hosting?.status;
  if (hosted && (!status || status === "unavailable")) return true;
  if (state.domainPathChanged || status === "applying") return true;
  return !state.domainDirty && status !== "pending_dns" && status !== "failed";
}
function domainActionLabel(state: PublicationSettingsController) {
  if (state.busy) return "Saving…";
  if (state.saved?.domain.hosting?.status === "pending_dns" && !state.domainDirty) return "Check DNS";
  return "Save address";
}
function HostingRetry({ state }: { state: PublicationSettingsController }) {
  const status = state.saved?.domain.hosting?.status;
  if (status && status !== "unavailable") return null;
  return <button type="button" className="button" disabled={state.busy} onClick={() => void state.refreshDomain()}>Retry</button>;
}
