import { useEffect, useState } from "react";
import { api, json } from "../api";
import SearchMeasurementHistory from "./SearchMeasurementHistory";

const path = "/settings/publishing/google";

interface Status {
  connected: boolean;
  available: boolean;
  properties?: string[];
}

interface Inspection {
  coverageState?: string;
  verdict?: string;
  lastCrawlTime?: string;
  googleCanonical?: string;
}

export default function SearchConsoleConnection() {
  const [status, setStatus] = useState<Status>();
  const [property, setProperty] = useState("");
  const [slug, setSlug] = useState("");
  const [inspection, setInspection] = useState<Inspection>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<Status>(path, { signal: controller.signal })
      .then(async (value) => {
        if (controller.signal.aborted) return;
        setStatus({ ...value, properties: undefined });
        if (value.connected) {
          const result = await api<{ properties: string[] }>(
            path + "/properties",
            { signal: controller.signal },
          );
          if (!controller.signal.aborted) {
            setStatus((current) =>
              current?.connected
                ? { ...current, properties: result.properties }
                : current,
            );
            setProperty(result.properties[0] ?? "");
          }
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setMessage(reason.message);
      });
    return () => controller.abort();
  }, []);

  async function run(
    action: "connect" | "disconnect" | "submit" | "inspect" | "sitemap-status",
  ) {
    setBusy(true);
    setInspection(undefined);
    setMessage("");
    try {
      const result = await api(
        path + "/" + action,
        json(
          "POST",
          {
            connect: {},
            disconnect: {},
            inspect: { property, slug },
            submit: { property },
            "sitemap-status": { property },
          }[action],
        ),
      );
      if (action === "connect") window.location.assign(result.url);
      if (action === "disconnect")
        setStatus(
          (current) =>
            current && { ...current, connected: false, properties: [] },
        );
      if (action === "submit")
        setMessage(
          "Google received the sitemap. Check processing status after Google downloads it.",
        );
      if (action === "inspect") setInspection(result);
      if (action === "sitemap-status") {
        setMessage(sitemapStatusMessage(result));
      }
    } catch (reason) {
      setMessage((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card search-engine-card">
      <h2>Connected Search Console account</h2>
      <p>
        Submit your blog sitemap and look up Google’s indexing status for
        published articles.
      </p>
      {status &&
        !status.connected &&
        (status.available ? (
          <button
            className="button"
            disabled={busy}
            onClick={() => run("connect")}
          >
            Connect Google
          </button>
        ) : (
          <p>
            Search Console account connections are unavailable on this
            installation.
          </p>
        ))}
      {status?.connected && (
        <fieldset disabled={busy}>
          <button className="button" onClick={() => run("disconnect")}>
            Disconnect Google
          </button>
          {status.properties &&
            (status.properties.length ? (
              <>
                <label>
                  Search Console property
                  <select
                    value={property}
                    onChange={(e) => {
                      setProperty(e.target.value);
                      setInspection(undefined);
                      setMessage("");
                    }}
                  >
                    {status.properties.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <button className="button" onClick={() => run("submit")}>
                  Submit blog sitemap
                </button>
                <button
                  className="button"
                  onClick={() => run("sitemap-status")}
                >
                  Check sitemap processing
                </button>
                <label>
                  Published article slug
                  <input
                    value={slug}
                    placeholder="my-article"
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setInspection(undefined);
                      setMessage("");
                    }}
                  />
                </label>
                <button
                  className="button"
                  disabled={!slug.trim()}
                  onClick={() => run("inspect")}
                >
                  Inspect and record indexing
                </button>
                <SearchMeasurementHistory
                  key={property + "/" + slug}
                  property={property}
                  slug={slug}
                />
              </>
            ) : (
              <p>
                No verified property covers this blog. Verify ownership in
                Search Console, then reopen this tab.
              </p>
            ))}
        </fieldset>
      )}
      {inspection && <InspectionResult inspection={inspection} />}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

function InspectionResult({ inspection }: { inspection: Inspection }) {
  return (
    <div role="status">
      <p>
        {inspection.coverageState ||
          inspection.verdict ||
          "Google returned no indexing status."}
      </p>
      {inspection.lastCrawlTime && (
        <p>Last crawled {inspection.lastCrawlTime}</p>
      )}
      {inspection.googleCanonical && (
        <p>Google-selected canonical: {inspection.googleCanonical}</p>
      )}
    </div>
  );
}

function sitemapStatusMessage(result: {
  isPending?: boolean;
  lastDownloaded?: string;
  errors?: string;
  warnings?: string;
}) {
  const state = result.isPending
    ? "Pending processing"
    : result.lastDownloaded
      ? "Downloaded"
      : "No download reported";
  return `${state}. Last download: ${result.lastDownloaded || "unavailable"}. Errors: ${result.errors ?? "unavailable"}. Warnings: ${result.warnings ?? "unavailable"}.`;
}
