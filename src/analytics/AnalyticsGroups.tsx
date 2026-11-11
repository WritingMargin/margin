import type { AnalyticsReport } from "../../shared/analytics";
import type { useAnalyticsReport } from "./useAnalyticsReport";
import {
  Countries,
  Clicks,
  Sections,
  Passages,
  Comments,
} from "./AnalyticsDetails";
import { Metrics, DailyChart } from "./AnalyticsOverview";
import AnalyticsPages from "./AnalyticsPages";
import AnalyticsContent from "./AnalyticsContent";
import AnalyticsMedia from "./AnalyticsMedia";
import AnalyticsMediaEvents from "./AnalyticsMediaEvents";
import ReactionMap from "./ReactionMap";

type State = ReturnType<typeof useAnalyticsReport>;
export default function AnalyticsGroups({
  state,
  data,
}: {
  state: State;
  data: AnalyticsReport;
}) {
  return (
    <>
      <div
        role="tabpanel"
        id={`analytics-group-panel-${state.group}`}
        aria-labelledby={`analytics-group-${state.group}`}
      >
        {state.group === "analytics" && (
          <>
            <Metrics data={data} />
            <DailyChart data={data} />
            <AnalyticsPages
              data={data}
              onPage={(value) => {
                state.showDetails("pages", value);
              }}
            />
          </>
        )}
        {state.group === "traffic" && (
          <>
            <DailyChart data={data} />
            <AnalyticsPages
              data={data}
              onPage={(value) => {
                state.showDetails("pages", value);
              }}
            />
            <Countries data={data} />
          </>
        )}
        {state.group === "content" && (
          <AnalyticsContent
            data={data}
            page={state.page}
            contentType={state.contentType}
            onClassified={state.refresh}
            refreshVersion={state.version}
          />
        )}
        {state.group === "reading" && (
          <>
            <ReactionMap data={data} page={state.page} range={state.range} version={state.version} />
            <Sections data={data} />
            <Passages data={data} />
            <Clicks data={data} />
          </>
        )}
        {state.group === "media" && (
          <>
            <AnalyticsMediaEvents data={data} />
            <AnalyticsMedia data={data} />
          </>
        )}
        {state.group === "conversations" && <Comments data={data} />}
      </div>
    </>
  );
}
