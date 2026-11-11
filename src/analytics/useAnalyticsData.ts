import { useEffect, useState } from "react";
import type {
  AnalyticsBreakdown,
  AnalyticsReport,
} from "../../shared/analytics";
import { api } from "../api";

export function useAnalyticsData(
  range: { from: string; to: string },
  page: string,
  pageSize: number,
  offsets: Partial<Record<AnalyticsBreakdown, number>>,
  version: number,
  contentType = "",
) {
  const [data, setData] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const params = new URLSearchParams({
    ...range,
    page,
    contentType,
    pageSize: String(pageSize),
  });
  for (const [key, offset] of Object.entries(offsets))
    params.set(`${key}Offset`, String(offset));
  const query = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<AnalyticsReport>(`/analytics?${query}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, version]);
  return { data, loading, error };
}
