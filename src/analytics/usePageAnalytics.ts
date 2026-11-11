import { useEffect } from "react";
import type { Post } from "../../shared/types";
import { analyticsAllowed, trackPublicPage } from "./tracker";
export function usePageAnalytics(post?: Post, disabled = false) {
  const enabled = !disabled && (!post || post.status === "published");
  const postId = post?.id || "",
    revision = post?.revision || "";
  useEffect(() => {
    if (!enabled || !analyticsAllowed()) return;
    let stop: (() => void) | undefined;
    // Let React commit page media, and avoid counting StrictMode's probe mount.
    const timer = window.setTimeout(() => {
      stop = trackPublicPage(postId, revision);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stop?.();
    };
  }, [enabled, postId, revision]);
}
