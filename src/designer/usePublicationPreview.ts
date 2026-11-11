import { useEffect, useState } from "react";
import { api } from "../api";
import type { Comment, Post } from "../../shared/types";

export function usePublicationPreview() {
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<{ posts: Post[]; loading: boolean; error: string }>({ posts: [], loading: true, error: "" });
  const [selection, setSelection] = useState("");
  const [detail, setDetail] = useState<{ slug: string; post: Post | null; comments: Comment[]; error: string }>({ slug: "", post: null, comments: [], error: "" });
  useEffect(() => {
    const controller = new AbortController();
    setList(current => ({ ...current, loading: true, error: "" }));
    api<Post[]>("/public/posts", { signal: controller.signal })
      .then(posts => { if (!controller.signal.aborted) setList({ posts: posts.filter(post => post.status === "published"), loading: false, error: "" }); })
      .catch(error => { if (!controller.signal.aborted) setList({ posts: [], loading: false, error: error.message }); });
    return () => controller.abort();
  }, [attempt]);
  const selected = list.posts.find(post => post.slug === selection) ?? list.posts[0];
  const slug = selected?.slug ?? "";
  const id = selected?.id ?? "";
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setDetail({ slug, post: null, comments: [], error: "" });
    api<Post>(`/public/posts/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(post => { if (!controller.signal.aborted) setDetail(current => ({ ...current, slug, post })); })
      .catch(error => { if (!controller.signal.aborted) setDetail({ slug, post: null, comments: [], error: error.message }); });
    api<Comment[]>(`/public/posts/${encodeURIComponent(id)}/comments`, { signal: controller.signal })
      .then(comments => { if (!controller.signal.aborted) setDetail(current => ({ ...current, comments })); })
      .catch(() => { /* Comments do not block previewing the article. */ });
    return () => controller.abort();
  }, [slug, id, attempt]);
  return {
    ...list, selectedSlug: slug, select: setSelection,
    post: detail.slug === slug ? detail.post : null,
    comments: detail.slug === slug ? detail.comments : [],
    articleError: detail.slug === slug ? detail.error : "",
    retry: () => setAttempt(current => current + 1),
  };
}
export type PublicationPreviewContent = ReturnType<typeof usePublicationPreview>;
