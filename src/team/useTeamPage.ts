import { useEffect, useState } from "react";
import { postPageSizes } from "../admin/usePostsPagination";
import { loadTeamPage, type TeamCollection, type TeamPage } from "./team-pagination";

const emptyPage = <T,>(page: number, pageSize: number): TeamPage<T> => ({ items: [], total: 0, page, pageSize, pages: 1 });
export function useTeamPage<T>(collection: TeamCollection, enabled: boolean, version: number) {
  const [page, setPage] = useState(1);
  const [pageSize, setSize] = useState(10);
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<{ key: string; data: TeamPage<T>; error: string }>({ key: "", data: emptyPage(1, 10), error: "" });
  const key = `${collection}:${page}:${pageSize}:${version}:${attempt}`;
  useEffect(() => {
    if (!enabled || response.key === key) return;
    const request = new AbortController();
    loadTeamPage<T>(collection, page, pageSize, request.signal)
      .then(data => {
        if (request.signal.aborted) return;
        // Adopt a server-clamped page after deletions. Tag the response with
        // that same selection so it stays visible without a duplicate fetch.
        setPage(data.page);
        setResponse({ key: `${collection}:${data.page}:${pageSize}:${version}:${attempt}`, data, error: "" });
      })
      .catch(error => {
        if (!request.signal.aborted) setResponse({ key, data: emptyPage(page, pageSize), error: error.message });
      });
    return () => request.abort();
  }, [collection, enabled, key, page, pageSize, version, attempt, response.key]);
  const current = response.key === key;
  const data = current ? response.data : emptyPage<T>(page, pageSize);
  function setPageSize(size: number) {
    if (!postPageSizes.includes(size)) return;
    setSize(size);
    setPage(1);
  }
  return {
    ...data,
    loaded: response.key !== "",
    loading: enabled && !current,
    error: current ? response.error : "",
    setPage: (next: number) => setPage(Math.max(1, next)),
    setPageSize,
    retry: () => setAttempt(value => value + 1),
    start: data.items.length ? (data.page - 1) * data.pageSize + 1 : 0,
    end: data.items.length ? (data.page - 1) * data.pageSize + data.items.length : 0,
  };
}
export type TeamPageController<T> = ReturnType<typeof useTeamPage<T>>;
