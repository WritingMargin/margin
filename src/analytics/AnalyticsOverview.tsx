import { useState } from "react";
import type { AnalyticsReport } from "../../shared/analytics";
import { number, duration } from "./AnalyticsDetails";
import {
  AnalyticsDisclosure,
  ResultPagination,
  useAnalyticsControls,
} from "./AnalyticsControls";
export function Metrics({ data }: { data: AnalyticsReport }) {
  const summary = data.summary;
  const eventCount = (kind: string) =>
    summary.events.find((event) => event.kind === kind)?.count || 0;
  const metrics = [
    ["Page views", number(summary.views), "Homepage & content opens"],
    [
      "Reading sessions",
      number(summary.sessions),
      "Anonymous browser sessions",
    ],
    [
      "Avg. active time",
      duration(summary.active_ms / Math.max(1, summary.views)),
      "Per page view",
    ],
    [
      "Avg. scroll depth",
      `${Math.round(summary.scroll_depth)}%`,
      "Furthest point reached",
    ],
    ["Clicks", number(eventCount("click")), "Links & page controls"],
    ["Highlights", number(eventCount("highlight")), "Passages selected"],
    ["Copies", number(eventCount("copy")), "Content text copied"],
    [
      "Comments",
      number(summary.comments),
      `${number(summary.approved_comments)} approved · includes questions`,
    ],
  ];
  return (
    <div className="analytics-metrics">
      {metrics.map(([label, value, caption]) => (
        <div className="analytics-metric" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{caption}</small>
        </div>
      ))}
    </div>
  );
}
export function DailyChart({ data }: { data: AnalyticsReport }) {
  const controls = useAnalyticsControls();
  const days: { day: string; views: number }[] = [];
  for (
    const date = new Date(`${data.from}T00:00:00Z`);
    date.toISOString().slice(0, 10) <= data.to;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.toISOString().slice(0, 10);
    days.push({
      day,
      views: data.daily.find((item) => item.day === day)?.views || 0,
    });
  }
  const max = Math.max(1, ...days.map((day) => day.views));
  return (
    <>
      <div className="analytics-panel">
        <div className="analytics-panel-heading">
          <h2>Readership over time</h2>
          <span>Daily page views · UTC</span>
        </div>
        <div
          className="analytics-chart"
          role="img"
          aria-label={`Daily page views from ${data.from} to ${data.to}. ${number(data.summary.views)} total. Open daily details for individual values.`}
        >
          {days.map((item) => (
            <div className="analytics-chart-slot" key={item.day}>
              <div
                className="analytics-chart-bar"
                style={{ height: `${(item.views / max) * 100}%` }}
                title={`${item.day}: ${item.views} views`}
              />
            </div>
          ))}
        </div>
        <div className="analytics-chart-axis">
          <span>{data.from}</span>
          <span>Peak {number(data.summary.views ? max : 0)} views / day</span>
          <span>{data.to}</span>
        </div>
        {controls.mode === "overview" && (
          <div className="analytics-results-footer">
            <span>{days.length} days</span>
            <button
              className="button"
              onClick={() => controls.showDetails("daily")}
            >
              View daily details →
            </button>
          </div>
        )}
      </div>
      {controls.mode === "details" && (
        <DailyNumbers
          key={`${data.from}:${data.to}:${data.pagination.pages.pageSize}`}
          days={days}
          size={data.pagination.pages.pageSize}
        />
      )}
    </>
  );
}
function DailyNumbers({
  days,
  size,
}: {
  days: { day: string; views: number }[];
  size: number;
}) {
  const [offset, setOffset] = useState(0);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const visible = days
    .filter((item) => includeEmpty || item.views > 0)
    .reverse();
  const pageOffset = Math.min(
    offset,
    Math.max(0, Math.ceil(visible.length / size) - 1) * size,
  );
  return (
    <AnalyticsDisclosure
      section="daily"
      title="Daily numbers"
      description="Daily page views, newest first. The chart includes every day."
    >
      <label className="analytics-daily-options">
        <input
          type="checkbox"
          checked={includeEmpty}
          onChange={(event) => {
            setIncludeEmpty(event.target.checked);
            setOffset(0);
          }}
        />
        Include days without views
      </label>
      {visible.length ? (
        <>
          <div className="analytics-table-wrap">
            <table className="analytics-daily-table">
              <thead>
                <tr>
                  <th>Date (UTC)</th>
                  <th>Views</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(pageOffset, pageOffset + size).map((item) => (
                  <tr key={item.day}>
                    <td>
                      <time dateTime={item.day}>
                        {dailyDate.format(new Date(`${item.day}T00:00:00Z`))}
                      </time>
                    </td>
                    <td>{number(item.views)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ResultPagination
            label="Daily numbers"
            info={{ total: visible.length, offset: pageOffset, pageSize: size }}
            disabled={false}
            onOffset={setOffset}
          />
        </>
      ) : (
        <p className="analytics-no-data">No page views in this period.</p>
      )}
    </AnalyticsDisclosure>
  );
}

const dailyDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
