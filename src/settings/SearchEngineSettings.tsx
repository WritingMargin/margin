import { useEffect, useId, useState } from "react";
import { Globe, ExternalLink } from "lucide-react";
import { api, json } from "../api";
import type { PublicationSettingsController } from "./usePublicationSettings";
import "./SearchEngineSettings.css";
import SearchConsoleConnection from "./SearchConsoleConnection";
import SitemapDiscovery from "./SitemapDiscovery";

interface SearchEngineStatus {
  enabled: boolean;
  origin: string;
  indexing: boolean;
  pending: number;
  failed: number;
  lastSubmission: string | null;
  lastAttempt: { status: string; message: string; attempted_at: string } | null;
}

function BingSearchSettings({ refreshKey }: { refreshKey: string }) {
  const [status, setStatus] = useState<SearchEngineStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api<SearchEngineStatus>("/settings/search-engines")
        .then((value) => {
          if (active) {
            setStatus(value);
            setError("");
          }
        })
        .catch((reason) => {
          if (active) setError(reason.message);
        });
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshKey]);

  async function change(enabled?: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const submit = enabled === undefined;
      const result = await api<SearchEngineStatus>(
        `/settings/search-engines${submit ? "/submit" : ""}`,
        json(submit ? "POST" : "PUT", submit ? {} : { enabled }),
      );
      setStatus(result);
      setNotice(
        submit
          ? "Published pages queued for submission."
          : "Search submission settings saved.",
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const controls = bingControls(status, busy);
  return (
    <section
      className="settings-card search-engine-card"
      aria-labelledby="bing-search-heading"
    >
      <div className="settings-icon">
        <Globe />
      </div>
      <h2 id="bing-search-heading">Bing & other search engines</h2>
      <p>
        Notify Bing and other IndexNow search engines when you publish, update,
        or remove a post. No account or API key needed.
      </p>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={controls.enabled}
          disabled={!controls.canToggle}
          onChange={(event) => {
            void change(event.target.checked);
          }}
        />
        <span>Automatically submit published changes</span>
      </label>
      <p className="small-text">
        Margin hosts the verification file and retries temporary failures.
        Drafts are never submitted.
      </p>
      <BingStatus status={status} />
      {error && (
        <p role="alert" className="search-engine-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="small-text">
          {notice}
        </p>
      )}
      <div className="settings-actions">
        <button
          type="button"
          className="button"
          disabled={!controls.canSubmit}
          onClick={() => {
            void change();
          }}
        >
          {busy ? "Saving…" : "Submit published pages"}
        </button>
      </div>
      <p className="small-text">
        Submission helps discovery. Search engines decide whether and when to
        index your pages.
      </p>
    </section>
  );
}
function bingControls(status: SearchEngineStatus | null, busy: boolean) {
  if (!status || busy)
    return {
      enabled: status?.enabled ?? false,
      canToggle: false,
      canSubmit: false,
    };
  const ready = Boolean(status.origin && status.indexing);
  return {
    enabled: status.enabled,
    canToggle: ready || status.enabled,
    canSubmit: ready && status.enabled,
  };
}
function BingStatus({ status }: { status: SearchEngineStatus | null }) {
  if (!status)
    return <p className="small-text">Loading search submission settings…</p>;
  if (!status.origin)
    return (
      <p className="search-engine-notice">
        Set a public HTTPS blog URL in Domain settings to enable submissions.
      </p>
    );
  if (!status.indexing)
    return (
      <p className="search-engine-notice">
        Submissions are paused. Enable search indexing and save your blog SEO
        settings to continue.
      </p>
    );
  return (
    <div className="search-engine-status" aria-live="polite">
      <span>
        {status.enabled
          ? "Automatic submission enabled"
          : "Automatic submission off"}
      </span>
      <p>
        {status.pending} queued · {status.failed} need attention
      </p>
      {status.lastSubmission && (
        <p>Last received: {new Date(status.lastSubmission).toLocaleString()}</p>
      )}
      {status.lastAttempt && <p>{status.lastAttempt.message}</p>}
    </div>
  );
}
function CopyAddress({ label, value }: { label: string; value: string }) {
  const [message, setMessage] = useState("");
  const id = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied");
    } catch {
      setMessage("Select the address and copy it.");
    }
  }
  return (
    <div className="search-engine-address">
      <label htmlFor={id}>{label}</label>
      <div className="search-engine-address-controls">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
        />
        <button
          type="button"
          className="button"
          onClick={() => {
            void copy();
          }}
        >
          Copy
        </button>
      </div>
      {message && (
        <span role="status" className="small-text">
          {message}
        </span>
      )}
    </div>
  );
}
function GoogleSearchSettings({
  state,
}: {
  state: PublicationSettingsController;
}) {
  if (!state.seo) return null;
  const home = `${state.saved?.domain.effectiveUrl ?? ""}/`;
  const sitemap = `${home}sitemap.xml`;
  const consoleURL = `https://search.google.com/search-console?resource_id=${encodeURIComponent(home)}`;
  return (
    <form
      className="settings-card search-engine-card"
      onSubmit={(event) => {
        event.preventDefault();
        void state.save("seo");
      }}
    >
      <div className="settings-icon">
        <Globe />
      </div>
      <h2>Google Search Console</h2>
      <p>
        Verify your blog once and submit its sitemap. Margin keeps the sitemap
        up to date as you publish.
      </p>
      <ol className="search-engine-steps">
        <li>
          <a
            href="https://search.google.com/search-console/welcome"
            target="_blank"
            rel="noreferrer"
          >
            Open Search Console <ExternalLink size={13} />
          </a>{" "}
          and add a <strong>URL-prefix</strong> property with this exact
          address.
          <CopyAddress label="Blog address" value={home} />
        </li>
        <li>
          Choose <strong>HTML tag</strong> verification and paste only its{" "}
          <code>content</code> value below. Save it here, then click{" "}
          <strong>Verify</strong> in Google.
        </li>
      </ol>
      <fieldset disabled={state.busy}>
        <label htmlFor="seo-verification">Google verification token</label>
        <input
          id="seo-verification"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={256}
          placeholder="Token from the HTML verification tag"
          value={state.seo.googleVerification}
          onChange={(event) =>
            state.setSEO(
              (current) =>
                current && {
                  ...current,
                  googleVerification: event.target.value,
                },
            )
          }
        />
        <div className="settings-actions">
          <button className="button primary" disabled={!state.seoDirty}>
            {state.busy ? "Saving…" : "Save SEO & verification"}
          </button>
        </div>
      </fieldset>
      {state.saved?.seo.googleVerification && (
        <p className="small-text">
          Verification tag saved. Complete verification in Google Search
          Console.
        </p>
      )}
      <ol start={3} className="search-engine-steps">
        <li>
          In Search Console, open <strong>Sitemaps</strong> and submit this
          address.
          <CopyAddress label="Sitemap address" value={sitemap} />
          <SitemapDiscovery key={home} home={home} sitemap={sitemap} />
        </li>
      </ol>
      <a className="button" href={consoleURL} target="_blank" rel="noreferrer">
        Open Search Console <ExternalLink size={14} />
      </a>
      {!state.saved?.seo.indexing && (
        <p className="search-engine-notice">
          Enable and save search indexing before submitting your sitemap.
        </p>
      )}
      <p className="small-text">
        Google handles verification and sitemap submission in Search Console.
        Saving a tag here does not mean Google has verified or indexed your
        blog.
      </p>
    </form>
  );
}
export default function SearchEngineSettings({
  state,
  section,
}: {
  state: PublicationSettingsController;
  section: "bing" | "google";
}) {
  if (section === "google")
    return (
      <>
        <SearchConsoleConnection />
        <GoogleSearchSettings state={state} />
      </>
    );
  return (
    <BingSearchSettings
      refreshKey={`${state.saved?.domain.effectiveUrl}:${state.saved?.seo.indexing}`}
    />
  );
}
