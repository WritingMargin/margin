import type { Post } from "./types";

export const reviewFields = [
  ["contentType", "Content type"],
  ["title", "Title"],
  ["content", "Article Markdown"],
  ["slug", "Slug"],
  ["excerpt", "Excerpt"],
  ["tags", "Tags"],
  ["cover", "Cover media"],
  ["coverMode", "Cover display"],
  ["featured", "Featured on homepage"],
  ["tableOfContents", "Table of contents"],
  ["seo.title", "Search title"],
  ["seo.description", "Search description"],
  ["seo.image", "Sharing image"],
  ["recommendations", "Recommended posts"],
] as const;
export type ReviewField = (typeof reviewFields)[number][0];
export type Choice = "mine" | "latest" | "edited";
export type Resolutions = Partial<Record<ReviewField, Choice>>;
function seoField(key: ReviewField): key is "seo.title" | "seo.description" | "seo.image" { return key.startsWith("seo."); }
function options(post: Post) {
  return { coverMode: post.coverMode ?? "player", contentType: post.contentType ?? "article", tableOfContents: post.tableOfContents ?? "off", featured: post.featured ?? false };
}
export function fieldValue(post: Post, key: ReviewField): string {
  const defaults = options(post);
  if (key in defaults) return String(defaults[key as keyof typeof defaults]);
  if (key === "tags") return JSON.stringify(post.tags, null, 2);
  if (key === "recommendations")
    return JSON.stringify(post.recommendations, null, 2) ?? "";
  if (seoField(key)) return post.seo[key.slice(4) as "title" | "description" | "image"];
  return String(post[key] ?? "");
}
export function changedFields(before: Post, after: Post) {
  return reviewFields.filter(
    ([key]) => fieldValue(before, key) !== fieldValue(after, key),
  );
}
export function conflictFields(base: Post, mine: Post, latest: Post) {
  return reviewFields.filter(([key]) => {
    const old = fieldValue(base, key),
      local = fieldValue(mine, key),
      remote = fieldValue(latest, key);
    return local !== remote && local !== old && remote !== old;
  });
}
export function resolvedPost(
  base: Post,
  mine: Post,
  latest: Post,
  choices: Resolutions,
  editedContent: string,
): Post {
  for (const [key] of conflictFields(base, mine, latest)) {
    if (!choices[key])
      throw new Error(
        "Review every conflicting field before applying changes.",
      );
  }
  const result: Post = { ...latest, seo: { ...latest.seo } };
  for (const [key] of reviewFields) {
    const choice =
      choices[key] ??
      (fieldValue(mine, key) === fieldValue(base, key) ? "latest" : "mine");
    copyField(result, choice === "latest" ? latest : mine, key);
  }
  if (choices.content === "edited") result.content = editedContent;
  return result;
}
function copyField(target: Post, source: Post, key: ReviewField) {
  if (seoField(key)) {
    const field = key.slice(4) as "title" | "description" | "image";
    target.seo[field] = source.seo[field];
  }
  else if (key in options(source)) Object.assign(target, { [key]: options(source)[key as keyof ReturnType<typeof options>] });
  else if (key === "tags") target.tags = [...source.tags];
  else if (key === "recommendations")
    target.recommendations = source.recommendations;
  else Object.assign(target, { [key]: source[key] ?? "" });
}
