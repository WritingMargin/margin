import type { Post } from "../../shared/types";
import { api, APIError, json } from "../api";

export async function readEditablePost(id: string, signal?: AbortSignal): Promise<Post> {
  const path = `/posts/${encodeURIComponent(id)}`;
  const current = await api<Post>(path, { signal });
  if (current.status === "archived") return current;
  return api<Post>(`${path}/draft`, { signal });
}

export class DraftPublishError extends APIError {
  constructor(public savedDraft: Post, cause: unknown) {
    super(`Your draft was saved, but publishing failed: ${(cause as Error).message}`, cause instanceof APIError ? cause.code : undefined, cause instanceof APIError ? cause.status : undefined);
  }
}
export async function persistEditablePost(post: Post, publish: boolean, baseline: Post | null): Promise<Post> {
  const path = `/posts/${encodeURIComponent(post.id)}`;
  const { baseRevision: _baseRevision, ...input } = post;
  if (!post.id) return api<Post>("/posts", json("POST", { ...input, status: publish ? "published" : "draft" }));
  // Explicit visibility changes retain the existing archive/restore semantics.
  if (post.status === "archived" || (baseline && post.status !== baseline.status && !baseline.baseRevision))
    return api<Post>(path, json("PUT", { ...input, status: publish ? "published" : post.status }));
  const saved = await api<Post>(`${path}/draft`, json("PUT", { ...input, status: "draft" }));
  return publish ? publishSavedDraft(path, saved) : saved;
}
async function publishSavedDraft(path: string, saved: Post): Promise<Post> {
  try { return await api<Post>(`${path}/draft/publish`, json("POST", { revision: saved.revision })); }
  catch (cause) { throw new DraftPublishError(saved, cause); }
}
export function changePublishedVisibility(post: Post, status: "draft" | "archived"): Promise<Post> {
  return api<Post>(`/posts/${encodeURIComponent(post.id)}`, json("PUT", { revision: post.baseRevision || post.revision, status }));
}
