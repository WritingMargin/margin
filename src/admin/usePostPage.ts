import { useEffect, useState } from "react";
import type { HomepagePost } from "../../shared/homepage";
import { api } from "../api";

type PostPage = { posts: HomepagePost[]; total: number; page: number; pageSize: number; pages: number };
const emptyPage = (pageSize: number): PostPage => ({ posts: [], total: 0, page: 1, pageSize, pages: 1 });

export function usePostPage(query: string, pageSize: number, version = 0, status = "all", enabled = true) {
  const scope = `${query}:${pageSize}:${status}`;
  const [selection, setSelection] = useState({ scope, page: 1 });
  useEffect(() => setSelection({ scope, page: 1 }), [scope]);
  const requestedPage = selection.scope === scope ? selection.page : 1;
  const [attempt, setAttempt] = useState(0);
  const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(pageSize), status });
  if (query.trim()) params.set("q", query.trim());
  const path = `/posts/page?${params}`;
  const key = `${path}:${version}:${attempt}`;
  const [response, setResponse] = useState({ key: "", data: emptyPage(pageSize), error: "" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api<PostPage>(path, { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setResponse({ key, data, error: "" }); })
        .catch(error => { if (!controller.signal.aborted) setResponse({ key, data: emptyPage(pageSize), error: error instanceof TypeError ? "You’re offline. Server content will return when you reconnect." : error.message }); });
    }, query.trim() ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [path, key, pageSize, enabled, query]);
  const current = response.key === key;
  return {
    ...(current ? response.data : emptyPage(pageSize)),
    loading: enabled && !current,
    error: current ? response.error : "",
    setPage: (page: number) => setSelection({ scope, page: Math.max(1, page) }),
    retry: () => setAttempt(value => value + 1),
  };
}
export type PostPageController = ReturnType<typeof usePostPage>;
