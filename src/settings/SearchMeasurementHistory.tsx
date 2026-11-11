import { useState } from "react";
import { api, json } from "../api";

interface Traffic {
  startDate: string;
  endDate: string;
  totals: { clicks: number; impressions: number } | null;
  queries: { keys: string[]; clicks: number; impressions: number }[] | null;
}

interface Indexing {
  coverageState?: string;
  verdict?: string;
  googleCanonical?: string;
  lastCrawlTime?: string;
}

type Measurement =
  | { kind: "performance"; recorded_at: string; snapshot: Traffic }
  | { kind: "indexing"; recorded_at: string; snapshot: Indexing };

const base = "/settings/publishing/google";
export default function SearchMeasurementHistory({
  property,
  slug,
}: {
  property: string;
  slug: string;
}) {
  const [busy, setBusy] = useState(false);
  const [records, setRecords] = useState<Measurement[]>();
  const [error, setError] = useState("");
  async function load(refresh: boolean) {
    setBusy(true);
    setError("");
    try {
      if (refresh)
        await api(base + "/performance", json("POST", { property, slug }));
      const query = new URLSearchParams({ property, slug });
      setRecords(
        (await api<{ records: Measurement[] }>(base + "/history?" + query))
          .records,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p>
        Record web search impressions, clicks and the top queries Google reports
        for this article. Compare results after two to four weeks.
      </p>
      <div className="settings-actions">
        <button
          type="button"
          className="button"
          disabled={busy || !slug.trim()}
          onClick={() => load(true)}
        >
          Record 28-day performance
        </button>
        <button
          type="button"
          className="button"
          disabled={busy || !slug.trim()}
          onClick={() => load(false)}
        >
          View saved measurements
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {records?.length === 0 && (
        <p role="status">
          No measurements saved for this article and property yet.
        </p>
      )}
      {records && records.length > 0 && (
        <div aria-label="Saved Search Console measurements">
          {records.map((record) => (
            <details key={record.recorded_at + record.kind}>
              <summary>
                {new Date(record.recorded_at).toLocaleDateString()} ·{" "}
                {record.kind === "indexing"
                  ? record.snapshot.coverageState ||
                    record.snapshot.verdict ||
                    "Indexing status unavailable"
                  : trafficSummary(record.snapshot)}
              </summary>
              {record.kind === "performance" ? (
                <div>
                  <p>
                    {record.snapshot.startDate} through{" "}
                    {record.snapshot.endDate} · Final web search data
                  </p>
                  {!!record.snapshot.queries?.length && (
                    <table>
                      <caption>Top reported queries by clicks</caption>
                      <thead>
                        <tr>
                          <th>Query</th>
                          <th>Impressions</th>
                          <th>Clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {record.snapshot.queries.map((q) => (
                          <tr key={q.keys[0]}>
                            <th scope="row">{q.keys[0]}</th>
                            <td>{q.impressions}</td>
                            <td>{q.clicks}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <p>
                  Last crawl: {record.snapshot.lastCrawlTime || "Unavailable"} ·
                  Google-selected canonical:{" "}
                  {record.snapshot.googleCanonical || "Unavailable"}
                </p>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function trafficSummary(traffic: Traffic) {
  return traffic.totals
    ? `${traffic.totals.impressions} impressions · ${traffic.totals.clicks} clicks`
    : "Google reported no performance data";
}
