import { z } from "zod";
import { resolveContentType, type ContentType } from "./content-types";
import type { Post } from "./types";

const postSchema = z.object({
  id: z.string(),
  contentType: z.preprocess(value => value === "doc" ? "article" : value, z.enum(["article", "guide"]).optional()),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string(),
  content: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]),
  tags: z.array(z.string()),
  cover: z.string(),
  coverMode: z.enum(["player", "preview"]).optional(),
  featured: z.boolean().optional(),
  tableOfContents: z.enum(["off", "top", "left", "right"]).optional(),
  seo: z.object({
    title: z.string(),
    description: z.string(),
    image: z.string(),
  }),
  recommendations: z
    .object({
      mode: z.enum(["automatic", "smart", "manual"]),
      postIds: z.array(z.string()),
    })
    .optional(),
  revision: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const draftSchema = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  post: postSchema,
  baseline: postSchema.nullable(),
  pendingSync: z.boolean().optional(),
});
export type LocalDraft = z.infer<typeof draftSchema>;
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type DraftListStorage = DraftStorage & Pick<Storage, "length" | "key">;
export function localDraftKey(workspace: string, id: string, contentType?: ContentType) {
  const type = resolveContentType(contentType);
  const identity = id || (type === "article" ? "new" : `new:${type}`);
  return `margin:local-draft:${encodeURIComponent(workspace)}:${identity}`;
}
function storedDraft(storage: DraftStorage, workspace: string, id: string, contentType?: ContentType) {
  const key = localDraftKey(workspace, id, contentType);
  const legacyKey = !id && resolveContentType(contentType) === "article" ? `${key}:doc` : null;
  const current = storage.getItem(key);
  const value = current ?? (legacyKey ? storage.getItem(legacyKey) : null);
  return { key, legacyKey, current, value };
}
export function readLocalDraft(
  storage: DraftStorage,
  workspace: string,
  id: string,
  contentType?: ContentType,
): LocalDraft | null {
  const { key, legacyKey, current, value } = storedDraft(storage, workspace, id, contentType);
  if (!value) return null;
  const saved = draftSchema.parse(JSON.parse(value));
  if (saved.post.id !== id || (saved.baseline && saved.baseline.id !== id))
    throw new Error("Local draft belongs to another article.");
  if (
    id &&
    (!saved.baseline || saved.post.revision !== saved.baseline.revision)
  )
    throw new Error("Local draft has no matching revision baseline.");
  if (current === null && legacyKey) {
    // Move retired Doc backups only when no article backup would be overwritten.
    storage.setItem(key, JSON.stringify(saved));
    storage.removeItem(legacyKey);
  }
  return saved;
}
export function writeLocalDraft(
  storage: DraftStorage,
  workspace: string,
  post: Post,
  baseline: Post | null,
  pendingSync = false,
) {
  const saved: LocalDraft = {
    version: 1,
    savedAt: new Date().toISOString(),
    post,
    baseline,
    pendingSync,
  };
  storage.setItem(localDraftKey(workspace, post.id, post.contentType), JSON.stringify(saved));
}
export function cachedPostKey(workspace: string) {
  return `margin:cached-post:${encodeURIComponent(workspace)}`;
}
export function cacheSavedPost(storage: DraftStorage, workspace: string, post: Post) {
  if (!post.id) return;
  const key = cachedPostKey(workspace);
  try {
    storage.setItem(key, JSON.stringify(post));
  } catch (error) {
    // An old snapshot must not consume the space needed for a writer's draft.
    storage.removeItem(key);
    throw error;
  }
}
export function readCachedPost(storage: DraftStorage, workspace: string, id: string): Post | null {
  const value = storage.getItem(cachedPostKey(workspace));
  if (!value) return null;
  const post = postSchema.parse(JSON.parse(value));
  if (post.id !== id) return null;
  return post;
}
export function recoverOfflinePost(storage: DraftStorage, workspace: string, id: string): Post | null {
  try {
    const cached = readCachedPost(storage, workspace, id);
    if (cached) return cached;
  } catch { /* A damaged snapshot cannot hide an intact local draft. */ }
  return readLocalDraft(storage, workspace, id)?.baseline ?? null;
}
export function listPendingDrafts(storage: DraftListStorage, workspace: string): LocalDraft[] {
  const prefix = `margin:local-draft:${encodeURIComponent(workspace)}:`;
  const drafts: LocalDraft[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    try {
      const candidate = draftSchema.parse(JSON.parse(storage.getItem(key) || ""));
      if (key !== localDraftKey(workspace, candidate.post.id, candidate.post.contentType)) continue;
      const saved = readLocalDraft(storage, workspace, candidate.post.id, candidate.post.contentType);
      if (saved?.pendingSync) drafts.push(saved);
    } catch { /* Damaged backups remain untouched for manual recovery. */ }
  }
  return drafts.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export function removeLocalDraft(
  storage: DraftStorage,
  workspace: string,
  id: string,
  contentType?: ContentType,
) {
  storage.removeItem(localDraftKey(workspace, id, contentType));
}
