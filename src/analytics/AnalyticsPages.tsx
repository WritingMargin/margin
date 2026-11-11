import { ArrowUpRight } from "lucide-react";
import type { AnalyticsReport } from "../../shared/analytics";
import { AnalyticsDisclosure, AnalyticsPagination } from "./AnalyticsControls";
import { number, duration } from "./AnalyticsDetails";
export default function AnalyticsPages({
  data,
  onPage,
}: {
  data: AnalyticsReport;
  onPage: (page: string) => void;
}) {
  return (
    <AnalyticsDisclosure
      section="pages"
      title="Pages your readers visit"
      description="Choose a page to explore its readership and engagement."
    >
      <div className="analytics-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Views</th>
              <th>Avg. active time</th>
              <th>Avg. scroll depth</th>
            </tr>
          </thead>
          <tbody>
            {data.pages.map((item) => (
              <tr key={item.id}>
                <td>
                  <button
                    className="analytics-page-link"
                    onClick={() => onPage(item.id)}
                  >
                    {item.title}
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </button>
                </td>
                <td>{number(item.views)}</td>
                <td>{duration(item.active_ms / item.views)}</td>
                <td>{Math.round(item.scroll_depth)}%</td>
              </tr>
            ))}
            {!data.pages.length && (
              <tr>
                <td colSpan={4}>No page activity for these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <AnalyticsPagination section="pages" />
    </AnalyticsDisclosure>
  );
}
