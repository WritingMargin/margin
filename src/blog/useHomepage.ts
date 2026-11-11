import { homepageHasFeatured } from "../../shared/template-sections";
import { useState } from "react";
import { type Post, type Theme } from "../../shared/types";
import { localHomepage, type HomepagePage } from "../../shared/homepage";
import { useHomepageFeed } from "./useHomepageFeed";
import { useSearchResults } from "../useSearchResults";
import "../blog-design.css";

export function useHomepage({
  theme,
  posts,
  homepage,
  preview,
}: {
  theme: Theme;
  posts: Post[];
  homepage?: HomepagePage;
  preview?: boolean;
}) {
  const design = theme.homepage;
  const [query, setQuery] = useState(() => initialQuery(homepage));
  const feed = useHomepageFeed(homepage, query, design.pagination === "more");
  const previewSearch = useSearchResults(homepage ? "" : query.search, "public", posts);
  const searchState = homepage ? feed : previewSearch;
  const data =
    feed.data ||
    localHomepage(
      previewSearch.results,
      design.pageSize,
      query.page,
      query.selectedTags,
      design.pagination === "more",
      !homepageHasFeatured(design) || design.includeFeaturedInFeed,
      posts,
    );
  const append = design.pagination === "more" && query.page > 1;
  const setSearch = (search: string) =>
    setQuery((current) => ({ ...current, search, page: 1 }));
  const setTags = (selectedTags: string[]) =>
    setQuery((current) => ({ ...current, selectedTags: [...new Set(selectedTags)].sort(), page: 1 }));
  const setTag = (tag: string) => setTags(tag ? [tag] : []);
  const setPage = (page: number) =>
    setQuery((current) => ({ ...current, page }));
  return {
    theme,
    design,
    data,
    preview,
    search: query.search,
    ...homepageTopicState(data, query.selectedTags),
    setSearch,
    setTag,
    setTags,
    setPage,
    hasPosts: matchingPosts(query.search, query.selectedTags, data.total),
    showPagination: showControls(append, searchState.loading, searchState.error),
    filtered: data.posts,
    offset: Math.max(
      0,
      Math.min(data.total, data.page * data.pageSize) - data.posts.length,
    ),
    searchState: {
      loading: searchState.loading && !append,
      error: append ? "" : searchState.error,
      retry: searchState.retry,
    },
    moreLoading: feed.loading && append,
    moreError: append ? feed.error : "",
    retry: feed.retry,
  };
}
export type BlogHomepageController = ReturnType<typeof useHomepage>;

function homepageTopicState(data: HomepagePage, selectedTags: string[]) {
  return { tag: selectedTags[0] ?? "", selectedTags, tags: data.tags,
    topTags: data.topTags ?? data.tags.slice(0, 10), tagCounts: data.tagCounts ?? {} };
}

function initialQuery(homepage?: HomepagePage) {
  if (!homepage) return { search: "", selectedTags: [] as string[], page: 1 };
  return { search: homepage.query, selectedTags: homepage.selectedTags ?? (homepage.tag ? [homepage.tag] : []), page: homepage.page };
}

function matchingPosts(search: string, tags: string[], total: number) {
  return search.trim() || tags.length ? 1 : total;
}
function showControls(append: boolean, loading: boolean, error: string) {
  return append || (!loading && !error);
}
