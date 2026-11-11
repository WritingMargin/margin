import { sitePath } from "../base-path";
import Select from "../components/Select";
import AnalyticsTabs from "./AnalyticsTabs";
import AnalyticsDetailSidebar from "./AnalyticsDetailSidebar";
import { RefreshCw, ChartNoAxesCombined } from "lucide-react";
import PageHeading from "../components/PageHeading";
import AnalyticsGroups from "./AnalyticsGroups";
import { AnalyticsControls } from "./AnalyticsControls";
import PageSelect from "./PageSelect";
import { dateRange, useAnalyticsReport } from "./useAnalyticsReport";
import "./analytics.css";

export default function AnalyticsPage() {
  const state = useAnalyticsReport();
  return (
    <section className="page-content analytics-page">
      <PageHeading
        label="THE LIFE OF YOUR WORDS"
        title="Analytics"
        description="See what brings readers in, holds their attention, and stays with them."
      />
      <p className="analytics-inline-note"><a href={sitePath("/admin/readers?tab=guides")}>Guide responses by reader</a> · Completed steps and reported problems.</p>
      <AnalyticsTabs value={state.group} onChange={state.setGroup} />
      <AnalyticsToolbar state={state} />
      <p className="analytics-period">
        {state.range.from} — {state.range.to} · UTC · Up to 90 days of page
        activity
      </p>
      {state.error && (
        <div className="analytics-error" role="alert">
          <strong>Analytics couldn’t load.</strong>
          <p>{state.error}</p>
          <button className="button" onClick={state.refresh}>
            Try again
          </button>
        </div>
      )}
      {state.loading && (
        <p className="analytics-update" role="status">
          Updating analytics…
        </p>
      )}
      {state.data && !state.error && (
        <AnalyticsControls.Provider
          value={{
            mode: "overview",
            loading: state.loading,
            expanded: null,
            pagination: state.data.pagination,
            paginate: () => {},
            showDetails: state.showDetails,
          }}
        >
          <div aria-busy={state.loading}>
            <AnalyticsEmpty views={state.data.summary.views} />
            <p className="analytics-mode-note">
              Top 5 results per breakdown. Open details to explore the full list
              in the sidebar.
            </p>
            <AnalyticsGroups state={state} data={state.data} />
            <p className="analytics-note">
              Active time counts focused, visible pages and pauses after 60
              seconds without activity. Sessions are anonymous and scoped to a
              browser tab. Highlights and copies are separate actions; selecting
              and copying a passage records both.
            </p>
          </div>
        </AnalyticsControls.Provider>
      )}
      {state.detail && (
        <AnalyticsDetailSidebar
          key={`${state.detail.section}:${state.detail.page}:${state.range.from}:${state.range.to}`}
          section={state.detail.section}
          range={state.range}
          page={state.detail.page}
          pageOptions={state.data?.pageOptions || []}
          version={state.version}
          contentType={state.contentType}
          onClose={state.closeDetails}
        />
      )}
    </section>
  );
}
type State = ReturnType<typeof useAnalyticsReport>;
function AnalyticsEmpty({ views }: { views: number }) {
  if (views) return null;
  return (
    <div className="analytics-empty">
      <ChartNoAxesCombined size={28} aria-hidden="true" />
      <h2>A little quiet here, for now.</h2>
      <p>
        No tracked visits in this period. New reader visits will appear here;
        your signed-in visits are excluded.
      </p>
    </div>
  );
}
function AnalyticsToolbar({ state }: { state: State }) {
  return (
    <div className="analytics-toolbar">
      <label>Content type
        <Select value={state.contentType} onChange={(event) => state.changeContentType(event.target.value)}>
          <option value="">All content</option>
          <option value="article">Articles</option>
          <option value="guide">Guides</option>
        </Select>
      </label>
      <PageSelect
        value={state.page}
        options={state.data?.pageOptions || []}
        onChange={state.setPage}
      />
      <div className="analytics-period-actions">
        <label>
          Period
          <Select
            value={state.preset}
            onChange={(e) => state.changePreset(e.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom dates</option>
          </Select>
        </label>
        <button
          className="button analytics-refresh"
          disabled={state.loading}
          onClick={state.refresh}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>
      {state.preset === "custom" && (
        <>
          <label>
            From
            <input
              type="date"
              value={state.range.from}
              max={state.range.to}
              onChange={(e) =>
                state.setRange({ ...state.range, from: e.target.value })
              }
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={state.range.to}
              min={state.range.from}
              max={dateRange(1).to}
              onChange={(e) =>
                state.setRange({ ...state.range, to: e.target.value })
              }
            />
          </label>
        </>
      )}
    </div>
  );
}
