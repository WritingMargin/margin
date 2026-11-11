import { contentTypeLabel, resolveContentType } from "../../shared/content-types";
import { publicationCopy } from "../../shared/publication";
import { resolveAudio } from "../../shared/audio";
import { resolveVideo } from "../../shared/video";
import type { Post, Theme } from "../../shared/types";
import { sitePath, unmountPath } from "../base-path";
import CoverMedia, { hasCover } from "../CoverMedia";
import { date } from "./theme";

export default function RelatedPosts({ posts, theme }: { posts: Post[]; theme: Theme }) {
  if (posts.length === 0) return null;
  const words = publicationCopy(theme.publicationType);
  return (
    <section className="related-stories" aria-label={`Recommended ${words.plural}`}>
      <div className="related-stories-heading">
        <span>KEEP READING</span>
        <h2>A little more to explore</h2>
      </div>
      <div className="related-stories-grid">
        {posts.map((post) => {
          const audio = Boolean(resolveAudio(unmountPath(post.cover)));
          const mediaBadge = audio || Boolean(resolveVideo(unmountPath(post.cover)));
          return (
          <a
            key={post.id}
            className="related-story"
            href={sitePath(`/post/${encodeURIComponent(post.slug)}`)}
          >
            {!mediaBadge && hasCover(post.cover) && (
              <CoverMedia src={post.cover} thumbnail />
            )}
            <div>
              <div className="related-story-header">
                {mediaBadge && <CoverMedia src={post.cover} thumbnail />}
                <span className="related-story-meta">{date(post.createdAt)}</span>
              </div>
              <h3>{post.title}</h3>
              {post.excerpt && <p>{post.excerpt}</p>}
              <span className="related-story-link">
                Read {contentTypeLabel(resolveContentType(post.contentType), theme.publicationType).toLowerCase()} <span aria-hidden="true">↗</span>
              </span>
            </div>
          </a>
          );
        })}
      </div>
    </section>
  );
}
