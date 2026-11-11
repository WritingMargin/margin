import { useState } from "react";
import { api } from "../api";

interface Discovery {
  status: "found" | "missing" | "unavailable";
  message: string;
  directive?: string;
  httpStatus?: number;
}

export default function SitemapDiscovery({
  home,
  sitemap,
}: {
  home: string;
  sitemap: string;
}) {
  const [result, setResult] = useState<Discovery>();
  const [busy, setBusy] = useState(false);
  const url = new URL(home, "https://example.invalid");
  async function check() {
    setBusy(true);
    try {
      setResult(await api<Discovery>("/settings/search-engines/discovery"));
    } catch (error) {
      setResult({ status: "unavailable", message: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="search-engine-address">
      <p>
        Check whether the main website advertises this sitemap in its root{" "}
        <code>/robots.txt</code>.
      </p>
      {url.pathname !== "/" && (
        <p>
          Your blog uses a subpath. Only the operator of the main website can
          change its root file.
        </p>
      )}
      <button type="button" className="button" onClick={check} disabled={busy}>
        {busy ? "Checking…" : "Check root robots.txt"}
      </button>
      {result && (
        <div role="status">
          <p>
            {result.message}
            {result.status === "unavailable" && result.httpStatus
              ? ` (HTTP ${result.httpStatus})`
              : ""}
          </p>
          {result.status === "missing" && (
            <code>{result.directive || `Sitemap: ${sitemap}`}</code>
          )}
        </div>
      )}
    </div>
  );
}
