import { useState } from "react";
import InnerTabs from "../components/InnerTabs";
import SearchEngineSettings from "./SearchEngineSettings";
import { mediaPath } from "../base-path";
import { sitePath } from "../base-path";
import { Search } from "lucide-react";
import SharingImagePicker from "../media/SharingImagePicker";
import type { Theme } from "../../shared/types";
import type { SEOSettings as SEOConfiguration } from "../../shared/seo";
import type { PublicationSettingsController } from "./usePublicationSettings";
import { publicationCopy } from "../../shared/publication";

function SearchAppearance({
  state,
  theme,
}: {
  state: PublicationSettingsController;
  theme: Theme;
}) {
  const seo = state.seo;
  if (!seo) return null;
  const update = (patch: Partial<SEOConfiguration>) =>
    state.setSEO((current) => current && { ...current, ...patch });
  const defaultTitle = `${theme.name} — ${publicationCopy(theme.publicationType).navigation}`;
  const title = seo.title || defaultTitle;
  const description = seo.description || theme.description;
  return (
    <div className="publication-settings-grid">
      <form
        className="settings-card"
        onSubmit={(event) => {
          event.preventDefault();
          void state.save("seo");
        }}
      >
        <div className="settings-icon">
          <Search />
        </div>
        <h2>Blog SEO</h2>
        <p>
          Configure your publication’s homepage in search results and shared
          links. The meta description also describes your RSS feed.
        </p>
        <fieldset disabled={state.busy}>
          <label htmlFor="seo-title">
            Homepage search title{" "}
            <span className="muted">{seo.title.length}/120</span>
          </label>
          <input
            id="seo-title"
            maxLength={120}
            value={seo.title}
            placeholder={defaultTitle}
            onChange={(event) => update({ title: event.target.value })}
          />
          <label htmlFor="seo-description">
            Blog meta description{" "}
            <span className="muted">{seo.description.length}/320</span>
          </label>
          <textarea
            id="seo-description"
            rows={4}
            maxLength={320}
            value={seo.description}
            placeholder={theme.description}
            onChange={(event) => update({ description: event.target.value })}
          />
          <p className="small-text">
            Blank fields use your blog’s name and description. Individual posts
            use their own SEO settings, or their title and excerpt.
          </p>
          <SharingImagePicker
            label="Default sharing image (Open Graph)"
            value={seo.image}
            onChange={(image) => update({ image })}
          />
          <p className="small-text">
            Used on your homepage and articles without their own sharing image
            or cover.
          </p>
          <label className="settings-check" htmlFor="seo-indexing">
            <input
              id="seo-indexing"
              type="checkbox"
              checked={seo.indexing}
              onChange={(event) => update({ indexing: event.target.checked })}
            />
            <span>Allow search engines to index this blog</span>
          </label>
          <p className="small-text">
            Turning this off asks crawlers to remove your pages from search
            results. Your blog remains public.
          </p>
          <div className="settings-actions">
            <button className="button primary" disabled={!state.seoDirty}>
              {state.busy ? "Saving…" : "Save blog SEO settings"}
            </button>
            {state.seoDirty && <span className="muted">Unsaved changes</span>}
          </div>
        </fieldset>
      </form>
      <aside className="settings-card seo-preview">
        <span className="eyebrow">SEARCH PREVIEW</span>
        <p className="seo-preview-url">{state.saved?.domain.effectiveUrl}</p>
        <h3>{title}</h3>
        <p className="seo-preview-description">{description}</p>
        {!seo.indexing && (
          <p className="seo-indexing-note">Search indexing is turned off.</p>
        )}
        <p className="small-text">
          A preview of your homepage metadata. Search engines may display
          different text.
        </p>
        <div className="seo-preview-links">
          <a href={sitePath("/sitemap.xml")} target="_blank" rel="noreferrer">
            View sitemap ↗
          </a>
          <a href={sitePath("/robots.txt")} target="_blank" rel="noreferrer">
            View robots.txt ↗
          </a>
        </div>
        <span className="eyebrow">SHARED LINK PREVIEW</span>
        <div className="seo-share-card">
          {seo.image && (
            <img src={mediaPath(seo.image)} alt="Default sharing image" />
          )}
          <div>
            <strong>{title}</strong>
            <p>{description}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

const seoSteps = [
  { id: "appearance", label: "Search appearance", shortLabel: "Appearance" },
  { id: "bing", label: "Bing", shortLabel: "Bing" },
  { id: "google", label: "Google", shortLabel: "Google" },
] as const;
type SEOStep = (typeof seoSteps)[number]["id"];
export default function SEOSettings({
  state,
  theme,
}: {
  state: PublicationSettingsController;
  theme: Theme;
}) {
  const [step, setStep] = useState<SEOStep>(() => new URLSearchParams(globalThis.location?.search).get("provider") === "google" ? "google" : "appearance");
  return (
    <div className="seo-settings">
      <InnerTabs
        label="SEO setup steps"
        idPrefix="seo-step"
        panelId={() => "seo-step-panel"}
        tabs={seoSteps.map((item) => ({
          value: item.id,
          label: item.label,
          shortLabel: item.shortLabel,
        }))}
        value={step}
        onChange={setStep}
      />
      <div
        id="seo-step-panel"
        role="tabpanel"
        aria-labelledby={`seo-step-${step}`}
        tabIndex={0}
      >
        {step === "appearance" ? (
          <SearchAppearance state={state} theme={theme} />
        ) : (
          <div className="publication-settings-grid seo-engine-panel">
            <SearchEngineSettings state={state} section={step} />
          </div>
        )}
      </div>
    </div>
  );
}
