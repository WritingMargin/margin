import TeamSettings from "../team/TeamSettings";
import PWASettings from "../settings/PWASettings";
import PublicationTypeSettings from "../settings/PublicationTypeSettings";
import type { PublicationType } from "../../shared/publication";
import type { KeyboardEvent } from "react";
import type { Theme } from "../../shared/types";
import type { SettingsTab } from "../admin-route";
import PageHeading from "../components/PageHeading";
import SoftwareUpdateSettings from "../settings/SoftwareUpdateSettings";
import DomainSettings from "../settings/DomainSettings";
import SEOSettings from "../settings/SEOSettings";
import { usePublicationSettings } from "../settings/usePublicationSettings";
import IntegrationsSettings from "./IntegrationsSettings";
import BlogSEOShortcut from "../settings/BlogSEOShortcut";
import CountryDatabaseSettings from "../settings/CountryDatabaseSettings";
import "../settings/CountryDatabaseSettings.css";

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "seo", label: "Blog SEO" },
  { id: "pwa", label: "PWA" },
  { id: "integrations", label: "Integrations" },
  { id: "team", label: "Team" },
];
type Props = {
  cloudManaged: boolean;
  notify: (message: string) => void;
  theme: Theme;
  tab: SettingsTab;
  setTab: (tab: SettingsTab) => void;
  onDirtyChange: (dirty: boolean) => void;
  onPublicationChange: (type: PublicationType) => void;
};
export default function SettingsPanel({
  cloudManaged,
  notify,
  theme,
  tab,
  setTab,
  onDirtyChange,
  onPublicationChange,
}: Props) {
  const state = usePublicationSettings(notify, onDirtyChange, onPublicationChange);
  const arrowNavigation = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`settings-tab-${tabs[next].id}`)?.focus();
  };
  return (
    <section className="page-content">
      <PageHeading
        label="INDEPENDENTLY YOURS"
        title="Publication settings"
        description="Manage your blog’s address, search appearance, installed app, and connected tools."
      />
      <div className="settings-tabs" role="tablist" aria-label="Settings">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`settings-tab-${item.id}`}
            aria-controls={`settings-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => arrowNavigation(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`settings-panel-${tab}`}
        aria-labelledby={`settings-tab-${tab}`}
        tabIndex={0}
      >
        <SettingsContent state={state} tab={tab} cloudManaged={cloudManaged} notify={notify} theme={theme} setTab={setTab} />
      </div>
    </section>
  );
}

function SettingsContent({ state, tab, cloudManaged, notify, theme, setTab }: Pick<Props, "tab" | "cloudManaged" | "notify" | "theme" | "setTab"> & { state: ReturnType<typeof usePublicationSettings> }) {
 return <> {tab === "team" ? <TeamSettings cloudManaged={cloudManaged} /> : tab === "integrations" ? (
          <IntegrationsSettings notify={notify} />
        ) : (
          <>
            <SettingsLoadState state={state} />
            {state.saved &&
              (tab === "seo" ? (
                <SEOSettings state={state} theme={theme} />
              ) : tab === "pwa" ? (
                <PWASettings state={state} theme={theme} />
              ) : (
                <div className="settings-general">
                  <PublicationTypeSettings state={state} />
                  <DomainSettings state={state} />
                  {cloudManaged && <SoftwareUpdateSettings />}
                  <CountryDatabaseSettings />
                  <BlogSEOShortcut onOpen={() => setTab("seo")} />
                </div>
              ))}
          </>
        )} </>;
}

function SettingsLoadState({ state }: { state: ReturnType<typeof usePublicationSettings> }) {
 return <>
            {state.error && (
              <div className="error-box" role="alert">
                {state.error}
                {!state.saved && (
                  <button className="button" onClick={state.retry}>
                    Try again
                  </button>
                )}
              </div>
            )}
            {!state.saved && !state.error && (
              <p role="status">Loading settings…</p>
            )}
 </>;
}
