import { AnalyticsDisclosure, AnalyticsPagination } from "./AnalyticsControls";
import type { AnalyticsReport } from "../../shared/analytics";
import { sitePath } from "../base-path";
const countrySetupGuide = "https://github.com/WritingMargin/margin/blob/main/docs/analytics.md#country-setup";
export const number = (value: number) => new Intl.NumberFormat().format(value);
export function duration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
function countryName(code: string) {
  if (code === "Unknown" || !/^[A-Z]{2}$/.test(code)) return "Location unknown";
  try {
    return (
      new Intl.DisplayNames(undefined, { type: "region" }).of(code) || code
    );
  } catch {
    return code;
  }
}
export function Countries({ data }: { data: AnalyticsReport }) {
  const max = Math.max(1, ...data.countries.map((item) => item.views));
  const noLookup = data.countrySource === "none";
  const hasCountryCodes = data.countries.some((item) => /^[A-Z]{2}$/.test(item.country));
  return (
    <AnalyticsDisclosure
      section="countries"
      title="Where readers are"
      description={noLookup ? "Known countries and unknown locations, ranked by page views." : "Countries ranked by page views."}
    >
      {noLookup && (
        <p className="analytics-inline-note">
          No country database is installed. Reader IPs are not saved in analytics.
          {" "}<a href={sitePath("/admin/settings")}>Open country lookup settings</a>.
        </p>
      )}
      {(data.countrySource === "local" || hasCountryCodes) && (
        <p className="analytics-inline-note">
          <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer">
            IP Geolocation by DB-IP
          </a>
        </p>
      )}
      <div className="analytics-ranking">
        {data.countries.map((item) => (
          <div className="analytics-country" key={item.country}>
            <div>
              <span>{countryName(item.country)}
                {item.country === "Unknown" && noLookup && <small className="analytics-country-help">
                  <a href={countrySetupGuide} target="_blank" rel="noopener noreferrer">Add the IP database</a> to see countries.
                </small>}
              </span>
              <strong>
                {number(item.views)}{" "}
                <small>
                  {Math.round(
                    (item.views / Math.max(1, data.summary.views)) * 100,
                  )}
                  %
                </small>
              </strong>
            </div>
            <div className="analytics-track">
              <span style={{ width: `${(item.views / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      {!data.countries.length && (
        <p className="analytics-no-data">
          {noLookup ? <>Location unknown. <a href={countrySetupGuide} target="_blank" rel="noopener noreferrer">Add the IP database to see countries.</a></> : "Country data will appear with your first visits."}
        </p>
      )}
      <AnalyticsPagination section="countries" />
    </AnalyticsDisclosure>
  );
}
export function Clicks({ data }: { data: AnalyticsReport }) {
  return (
    <AnalyticsDisclosure
      section="clicks"
      title="What readers click"
      description="Links and page controls ranked by clicks."
    >
      <div className="analytics-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Destination / control</th>
              <th>Clicks</th>
            </tr>
          </thead>
          <tbody>
            {data.clicks.map((item) => (
              <tr key={item.target}>
                <td className="analytics-target">
                  {item.target.replace(/^button:/, "Control · ")}
                </td>
                <td>{number(item.clicks)}</td>
              </tr>
            ))}
            {!data.clicks.length && (
              <tr>
                <td colSpan={2}>No clicks recorded in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <AnalyticsPagination section="clicks" />
    </AnalyticsDisclosure>
  );
}
export function Sections({ data }: { data: AnalyticsReport }) {
  const max = Math.max(1, ...data.sections.map((item) => item.active_ms));
  return (
    <AnalyticsDisclosure
      section="sections"
      title="Where readers linger"
      description="Content sections ranked by active reading time."
    >
      <div className="analytics-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Article section</th>
              <th>Engaged views</th>
              <th>Avg. time</th>
              <th>Total active time</th>
            </tr>
          </thead>
          <tbody>
            {data.sections.map((item) => (
              <tr key={`${item.post_id}:${item.revision}:${item.section_id}`}>
                <td>
                  <strong>{item.label}</strong>
                  <small className="analytics-subtitle">
                    {item.title} · revision {item.revision.slice(0, 8)}
                  </small>
                </td>
                <td>{number(item.views)}</td>
                <td>{duration(item.active_ms / item.views)}</td>
                <td className="analytics-time-cell">
                  {duration(item.active_ms)}
                  <div className="analytics-track">
                    <span
                      style={{ width: `${(item.active_ms / max) * 100}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {!data.sections.length && (
              <tr>
                <td colSpan={4}>
                  Article section engagement will appear as readers spend time
                  with your content.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="analytics-inline-note">
        When several sections are visible, time goes to the one occupying the
        most screen space. Different article revisions stay separate.
      </p>
      <AnalyticsPagination section="sections" />
    </AnalyticsDisclosure>
  );
}
export function Passages({ data }: { data: AnalyticsReport }) {
  return (
    <AnalyticsDisclosure
      section="passages"
      title="Words worth keeping"
      description="Highlighted and copied passages · first 500 characters."
    >
      <div className="analytics-passages">
        {data.passages.map((item) => (
          <article
            key={`${item.post_id}:${item.revision}:${item.section_id}:${item.target}`}
          >
            <blockquote>{item.target}</blockquote>
            <div className="analytics-passage-meta">
              <span>
                {item.title} · revision {item.revision.slice(0, 8)}
              </span>
              <span>
                <strong>{number(item.highlights)}</strong> highlights{" "}
                <b aria-hidden="true">·</b>{" "}
                <strong>{number(item.copies)}</strong> copies
              </span>
            </div>
          </article>
        ))}
      </div>
      {!data.passages.length && (
        <p className="analytics-no-data">
          No highlighted or copied passages in this period.
        </p>
      )}
      <AnalyticsPagination section="passages" />
    </AnalyticsDisclosure>
  );
}
export function Comments({ data }: { data: AnalyticsReport }) {
  return (
    <AnalyticsDisclosure
      section="commentPages"
      title="Conversations started"
      description="Saved comments and passage questions, by submission date."
    >
      <div className="analytics-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Article</th>
              <th>Submitted</th>
              <th>Approved</th>
              <th>Pending</th>
              <th>Passage questions</th>
            </tr>
          </thead>
          <tbody>
            {data.commentPages.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>{number(item.comments)}</td>
                <td>{number(item.approved_count)}</td>
                <td>{number(item.comments - item.approved_count)}</td>
                <td>{number(item.questions)}</td>
              </tr>
            ))}
            {!data.commentPages.length && (
              <tr>
                <td colSpan={5}>No comments submitted in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <AnalyticsPagination section="commentPages" />
    </AnalyticsDisclosure>
  );
}
