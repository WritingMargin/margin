import type { Post } from "./types";
export type HomepagePost = Post & {
  searchSnippet?: string;
  searchMatches?: string[];
};
export type HomepagePage = {
  featured?: HomepagePost[];
  heroPosts?: HomepagePost[];
  posts: HomepagePost[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  tags: string[];
  topTags?: string[];
  tagCounts?: Record<string, number>;
  query: string;
  tag: string;
  selectedTags?: string[];
};

export function paginationPages(
  page: number,
  pages: number,
): (number | "gap")[] {
  const numbers = new Set([1, pages]);
  for (let p = Math.max(1, page - 1); p <= Math.min(pages, page + 1); p++)
    numbers.add(p);
  const result: (number | "gap")[] = [];
  let previous = 0;
  for (const p of [...numbers].sort((a, b) => a - b)) {
    if (p - previous > 1) result.push("gap");
    result.push(p);
    previous = p;
  }
  return result;
}
export function homepageQuery(page: number, query = "", tags: string | string[] = "") {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (query.trim()) params.set("q", query.trim());
  for (const tag of typeof tags === "string" ? (tags ? [tags] : []) : tags)
    if (tag) params.append("tag", tag);
  return params.toString();
}
export function topHomepageTags(posts: Post[], limit = 10) {
  const counts: Record<string, number> = {};
  for (const post of posts.filter((item) => item.status === "published"))
    for (const tag of new Set(post.tags)) counts[tag] = (counts[tag] ?? 0) + 1;
  const tags = Object.keys(counts).sort();
  const topTags = [...tags].sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)).slice(0, limit);
  return { tags, topTags, tagCounts: counts };
}
export function localHomepage(
  posts: Post[],
  pageSize: number,
  page: number,
  tags: string | string[],
  more = false,
  includeFeaturedInFeed = false,
  allPosts: Post[] = posts,
): HomepagePage {
  pageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  const published = allPosts.filter((p) => p.status === "published");
  const selectedTags = typeof tags === "string" ? (tags ? [tags] : []) : tags;
  const matching = posts.filter((p) => p.status === "published" && (!selectedTags.length || selectedTags.some((tag) => p.tags.includes(tag))));
  const featured = matching.filter((p) => p.featured);
  const filtered = matching.filter((p) => includeFeaturedInFeed || !p.featured);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  return {
    featured,
    heroPosts: published,
    posts: filtered.slice(
      more ? 0 : (current - 1) * pageSize,
      current * pageSize,
    ),
    total: filtered.length,
    page: current,
    pageSize,
    pages,
    ...topHomepageTags(published),
    query: "",
    tag: selectedTags[0] ?? "",
    selectedTags,
  };
}
