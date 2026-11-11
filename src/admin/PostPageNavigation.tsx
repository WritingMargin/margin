import type { PostPageController } from "./usePostPage";

export default function PostPageNavigation({ feed, label }: { feed: PostPageController; label: string }) {
  if (feed.loading) return <p className="small-text" role="status">Loading posts…</p>;
  if (feed.error) return <p className="small-text" role="alert">{feed.error} <button className="button" onClick={feed.retry}>Try again</button></p>;
  if (feed.pages <= 1) return null;
  return <nav className="post-page-navigation" aria-label={label}>
    <button type="button" aria-label="Previous posts" disabled={feed.page === 1} onClick={() => feed.setPage(feed.page - 1)}>←</button>
    <span role="status">{feed.page} / {feed.pages}</span>
    <button type="button" aria-label="Next posts" disabled={feed.page === feed.pages} onClick={() => feed.setPage(feed.page + 1)}>→</button>
  </nav>;
}
