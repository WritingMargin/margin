import { useState } from "react";
import { usePostPage } from "./usePostPage";
import { sitePath } from "../base-path";

export const postPageSizes = [10, 25, 50, 100];
const preferenceKey = () => `margin:${sitePath("/")}:posts-page-size`;
function savedPageSize() {
  try {
    const size = Number(localStorage.getItem(preferenceKey()));
    return postPageSizes.includes(size) ? size : 10;
  } catch {
    return 10;
  }
}

export function usePostsPagination(query: string, version: number) {
  const [pageSize, setSize] = useState(savedPageSize);
  const feed = usePostPage(query, pageSize, version);
  function setPageSize(size: number) {
    if (!postPageSizes.includes(size)) return;
    setSize(size);
    try { localStorage.setItem(preferenceKey(), String(size)); } catch { /* Storage is optional. */ }
  }
  const offset = (feed.page - 1) * pageSize;
  return {
    ...feed, pageSize, setPageSize,
    start: feed.total ? offset + 1 : 0,
    end: offset + feed.posts.length,
    visible: feed.posts,
  };
}
