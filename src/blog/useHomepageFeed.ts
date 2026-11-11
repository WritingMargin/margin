import { useEffect, useState } from "react";
import { api } from "../api";
import { sitePath } from "../base-path";
import { homepageQuery, type HomepagePage } from "../../shared/homepage";

type Query = { page: number; search: string; selectedTags: string[] };
function mergePages(
  previous: HomepagePage | undefined,
  next: HomepagePage,
  append: boolean,
) {
  if (
    !append ||
    !previous ||
    previous.query !== next.query ||
    JSON.stringify(previous.selectedTags ?? [previous.tag]) !== JSON.stringify(next.selectedTags ?? [next.tag]) ||
    previous.page + 1 !== next.page
  )
    return next;
  const ids = new Set(previous.posts.map((p) => p.id));
  return {
    ...next,
    posts: [...previous.posts, ...next.posts.filter((p) => !ids.has(p.id))],
  };
}
export function useHomepageFeed(
  initial: HomepagePage | undefined,
  query: Query,
  append: boolean,
) {
  const key = homepageQuery(query.page, query.search, query.selectedTags);
  const initialKey = initial
    ? homepageQuery(initial.page, initial.query, initial.selectedTags ?? initial.tag)
    : "";
  const [response, setResponse] = useState({
    key: initialKey,
    data: initial,
    error: "",
    loading: false,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!initial) return;
    if (key === initialKey && attempt === 0) {
      setResponse({ key, data: initial, error: "", loading: false });
      updateQueryURL(query.page, key);
      return;
    }
    const controller = new AbortController();
    setResponse((previous) => ({ ...previous, loading: true, error: "" }));
    const timer = window.setTimeout(
      () => {
        api<HomepagePage>(`/public/homepage?${key}`, {
          signal: controller.signal,
        })
          .then((data) => {
            if (controller.signal.aborted) return;
            setResponse((previous) => ({
              key,
              data: mergePages(previous.data, data, append),
              error: "",
              loading: false,
            }));
            updateQueryURL(query.page, key);
          })
          .catch((error) => {
            if (!controller.signal.aborted)
              setResponse((previous) => ({
                ...previous,
                key,
                loading: false,
                error: error.message,
              }));
          });
      },
      query.search ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [initial, initialKey, key, attempt, append, query.page, query.search]);
  return {
    ...response,
    loading: response.loading || (Boolean(initial) && response.key !== key),
    retry: () => setAttempt((n) => n + 1),
  };
}

function updateQueryURL(page: number, key: string) {
  if (page !== 1 || location.search.slice(1) === key) return;
  history.replaceState(history.state, "", sitePath("/") + (key ? `?${key}` : "") + "#posts");
}
