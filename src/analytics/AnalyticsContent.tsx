import type { AnalyticsReport } from "../../shared/analytics";
import { AnalyticsDisclosure, AnalyticsPagination } from "./AnalyticsControls";
import { duration, number } from "./AnalyticsDetails";
import ClassificationControls from "./ClassificationControls";

type ContentSection = "contentKinds" | "tags" | "contentTypes" | "writingStyles";
export default function AnalyticsContent({
  data,
  page,
  contentType,
  onClassified,
  refreshVersion,
}: {
  data: AnalyticsReport;
  page: string;
  contentType: string;
  onClassified: () => void;
  refreshVersion: number;
}) {
  return (
    <>
      <ContentRanking data={data} section="contentKinds" title="Content types" description="Compare articles and guides by reader engagement." />
      <ContentRanking
        data={data}
        section="tags"
        title="Tags that hold attention"
        description="Topics ranked by total active reading time."
      />
      <ClassificationControls
        page={page}
        contentType={contentType}
        coverage={data.classificationCoverage}
        onClassified={onClassified}
        refreshVersion={refreshVersion}
      />
      <ContentRanking
        data={data}
        section="contentTypes"
        title="Content classifications"
        description="Compare tutorials, essays, news, and other formats."
      />
      <ContentRanking
        data={data}
        section="writingStyles"
        title="Writing styles"
        description="Compare how readers engage with different approaches to writing."
      />
    </>
  );
}
export function ContentRanking({
  data,
  section,
  title,
  description,
}: {
  data: AnalyticsReport;
  section: ContentSection;
  title: string;
  description: string;
}) {
  return (
    <AnalyticsDisclosure
      section={section}
      title={title}
      description={description}
    >
      <div className="analytics-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{section === "tags" ? "Tag" : "Classification"}</th>
              <th>Content items</th>
              <th>Views</th>
              <th>Avg. active time</th>
              <th>Total active time</th>
              <th>Avg. scroll</th>
            </tr>
          </thead>
          <tbody>
            {data[section].map((item) => (
              <tr key={item.label}>
                <td>
                  <strong>{section === "contentKinds" ? ({ article: "Articles", guide: "Guides" }[item.label] ?? item.label) : item.label}</strong>
                </td>
                <td>{number(item.articles)}</td>
                <td>{number(item.views)}</td>
                <td>{duration(item.active_ms / item.views)}</td>
                <td>{duration(item.active_ms)}</td>
                <td>{Math.round(item.scroll_depth)}%</td>
              </tr>
            ))}
            {!data[section].length && (
              <tr>
                <td colSpan={6}>No matching content visits in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="analytics-inline-note">
        {section === "contentKinds"
          ? "Uses the content type recorded when each visit began. No AI classification is required. Type changes do not relabel earlier visits."
          : section === "tags"
          ? "Uses current content tags. A visit counts toward each tag on its content item, so tag totals overlap."
          : "Margin’s Classifier suggests one dominant label per article revision; uncertain or tied results are Other / mixed. Rankings show total active time, not a prediction of success. Compare view counts and article length when interpreting averages."}
      </p>
      <AnalyticsPagination section={section} />
    </AnalyticsDisclosure>
  );
}
