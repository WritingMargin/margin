import type { ReactNode } from "react";
import type { AnalyticsReport } from "../../shared/analytics";
import type { AnalyticsPanel } from "./AnalyticsControls";
import {
  Countries,
  Clicks,
  Sections,
  Passages,
  Comments,
} from "./AnalyticsDetails";
import { ContentRanking } from "./AnalyticsContent";
import { DailyChart } from "./AnalyticsOverview";
import AnalyticsPages from "./AnalyticsPages";
import AnalyticsMedia from "./AnalyticsMedia";
import AnalyticsMediaEvents from "./AnalyticsMediaEvents";

export const breakdownTitles: Record<AnalyticsPanel, string> = {
  mediaEvents: "Player activity",
  media: "Audio & video",
  pages: "Pages",
  countries: "Countries",
  sections: "Content sections",
  passages: "Highlights & copies",
  clicks: "Clicks",
  commentPages: "Conversations",
  tags: "Tags",
  contentKinds: "Content types",
  contentTypes: "Content classifications",
  writingStyles: "Writing styles",
  daily: "Daily traffic",
};
export default function AnalyticsBreakdownView({
  section,
  data,
  onPage,
}: {
  section: AnalyticsPanel;
  data: AnalyticsReport;
  onPage: (page: string) => void;
}) {
  const views: Record<AnalyticsPanel, ReactNode> = {
    mediaEvents: <AnalyticsMediaEvents data={data} />,
    media: <AnalyticsMedia data={data} />,
    pages: <AnalyticsPages data={data} onPage={onPage} />,
    countries: <Countries data={data} />,
    sections: <Sections data={data} />,
    passages: <Passages data={data} />,
    clicks: <Clicks data={data} />,
    commentPages: <Comments data={data} />,
    daily: <DailyChart data={data} />,
    tags: (
      <ContentRanking
        data={data}
        section="tags"
        title="Tags"
        description="Topics ranked by total active reading time."
      />
    ),
    contentKinds: (
      <ContentRanking
        data={data}
        section="contentKinds"
        title="Content types"
        description="Articles and guides ranked by total active reading time."
      />
    ),
    contentTypes: (
      <ContentRanking
        data={data}
        section="contentTypes"
        title="Content classifications"
        description="Article formats ranked by total active reading time."
      />
    ),
    writingStyles: (
      <ContentRanking
        data={data}
        section="writingStyles"
        title="Writing styles"
        description="Writing styles ranked by total active reading time."
      />
    ),
  };
  return views[section];
}
