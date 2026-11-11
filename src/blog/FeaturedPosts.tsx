import type { Post, Theme } from "../../shared/types";
import { sitePath } from "../base-path";
import CoverMedia, { hasCover } from "../CoverMedia";
import { date } from "./theme";

export default function FeaturedPosts({ posts = [], theme }: { posts?: Post[]; theme: Theme }) {
  if (!posts.length) return null;
  const design = theme.homepage;
  return <section className="featured-posts" aria-label="Featured articles">
    <div className="journal-section-title"><h2>Featured</h2></div>
    <div className="journal-posts">
      {posts.map(post => <a key={post.id} className="journal-post" href={sitePath(`/post/${encodeURIComponent(post.slug)}`)}>
        <div className="journal-post-body">
          {design.showImages && hasCover(post.cover) && <CoverMedia src={post.cover} thumbnail />}
          {design.showTags && post.tags.length > 0 && <span className="eyebrow">{post.tags.join(" / ")}</span>}
          <h2>{post.title}</h2>
          {design.showExcerpts && <p>{post.excerpt}</p>}
          {design.showDates && <div className="journal-post-meta"><time dateTime={post.createdAt}>{date(post.createdAt)}</time></div>}
        </div>
      </a>)}
    </div>
  </section>;
}
