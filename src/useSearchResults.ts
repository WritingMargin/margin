import { useEffect, useState } from "react";
import type { Post } from "../shared/types";
import { api } from "./api";

export type SearchPost = Post & { searchSnippet?: string; searchMatches?: string[] };
type SearchResponse = { key: string; results: SearchPost[]; error: string };

export function useSearchResults(query: string, scope: "public" | "workspace", posts: Post[]) {
  const term = query.trim();
  const [response, setResponse] = useState<SearchResponse>({ key: "", results: [], error: "" });
  const [attempt, setAttempt] = useState(0);
  const versions = posts.map(post => `${post.id}:${post.revision}`).join(",");
  const key = `${scope}:${term}:${attempt}:${versions}`;
  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const endpoint = scope === "public" ? "/public/search" : "/posts/search";
      api<SearchPost[]>(`${endpoint}?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then(results => {
          if (!controller.signal.aborted) setResponse({ key, results, error: "" });
        })
        .catch(error => {
          if (!controller.signal.aborted) setResponse({ key, results: [], error: error.message });
        });
    }, 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term, scope, key]);
  const current = response.key === key;
  const results = term ? current ? response.results : [] : posts;
  return {
    results: results as SearchPost[],
    loading: !!term && !current,
    error: term && current ? response.error : "",
    retry: () => setAttempt(value => value + 1),
  };
}
