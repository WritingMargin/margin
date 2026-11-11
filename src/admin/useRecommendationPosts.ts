import { useEffect, useState } from "react";
import type { Post } from "../../shared/types";
import { api } from "../api";
import { usePostPage } from "./usePostPage";

export function useRecommendationPosts(post: Post, query: string) {
  const enabled = post.recommendations?.mode === "manual";
  const feed = usePostPage(query, 10, 0, "published", enabled);
  const ids = (post.recommendations?.postIds || []).join(",");
  const [selected, setSelected] = useState<Pick<Post, "id" | "title">[]>([]);
  useEffect(() => {
    if (!enabled || !ids) { setSelected([]); return; }
    const controller = new AbortController();
    Promise.all(ids.split(",").map(id =>
      api<Pick<Post, "id" | "title">>(`/posts/${encodeURIComponent(id)}?fields=id,title`, { signal: controller.signal }).catch(() => null),
    )).then(rows => {
      if (!controller.signal.aborted) setSelected(rows.filter(row => row !== null));
    });
    return () => controller.abort();
  }, [ids, enabled]);
  const visible = feed.posts.filter(item => item.id !== post.id);
  return { feed, visible, selected, empty: !feed.loading && !feed.error && !visible.length };
}
