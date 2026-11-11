import type { Post } from "./types";

export type RevisionAuthor = {
  kind: "owner" | "api_token" | "unknown";
  name: string;
};
export function authorLabel(author: RevisionAuthor): string {
  if (author.kind === "unknown") return "Author not recorded";
  return `${author.name} · ${author.kind === "api_token" ? "API token" : "Workspace owner"}`;
}
export interface PostRevisionSummary {
  author: RevisionAuthor;
  revision: string;
  version: number;
  savedAt: string;
  title: string;
  status: Post["status"];
}
export type PostRevision = Post &
  PostRevisionSummary & { content: string; previousRevision: string | null };

// Keep the current identity, publication state and concurrency token when restoring.
export function revisionFields(version: PostRevision): Partial<Post> {
  const { contentType, title, slug, excerpt, content, tags, cover, coverMode, seo, recommendations, featured, tableOfContents } =
    version;
  return { contentType: contentType ?? "article", title, slug, excerpt, content, tags, cover, coverMode: coverMode ?? "player", seo, recommendations, featured: featured ?? false, tableOfContents: tableOfContents ?? "off" };
}
