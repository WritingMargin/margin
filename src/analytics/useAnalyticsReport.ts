import { useState } from "react";
import type { AnalyticsGroup } from "./groups";
import type { AnalyticsPanel } from "./AnalyticsControls";
import { useAnalyticsData } from "./useAnalyticsData";
export function dateRange(days: number) {
  const end = new Date(),
    start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
export function useAnalyticsReport() {
  const [range, setRange] = useState(() => dateRange(30));
  const [preset, setPreset] = useState("30");
  const [page, setPage] = useState("");
  const [contentType, setContentType] = useState("");
  const [group, setGroup] = useState<AnalyticsGroup>("analytics");
  const [detail, setDetail] = useState<{
    section: AnalyticsPanel;
    page: string;
  } | null>(null);
  const [version, setVersion] = useState(0);
  const report = useAnalyticsData(range, page, 5, {}, version, contentType);
  const changePreset = (value: string) => {
    setPreset(value);
    if (value !== "custom") setRange(dateRange(Number(value)));
  };
  return {
    group,
    setGroup,
    range,
    setRange,
    preset,
    changePreset,
    page,
    setPage,
    contentType,
    changeContentType: (value: string) => { setContentType(value); setPage(""); setDetail(null); },
    detail,
    showDetails: (section: AnalyticsPanel, selectedPage = page) =>
      setDetail({ section, page: selectedPage }),
    closeDetails: () => setDetail(null),
    version,
    ...report,
    refresh: () => setVersion((value) => value + 1),
  };
}
