import type { Theme, Post } from "../../shared/types";
import type { PublicTheme } from "../../shared/frontend";
import type { AuthorProfile } from "../../shared/author-profile";
import CoverMedia, { hasCover } from "../CoverMedia";
import { date } from "./theme";
import PostByline from "./PostByline";
import { useAuthorProfile } from "../profile/AuthorProfileContext";
import type { ReactNode } from "react";
export default function ArticleOpening({
  theme,
  post,
  actions,
}: {
  theme: Theme;
  post: Post;
  actions?: ReactNode;
}) {
  const design = theme.article;
  const cover =
    design.showCover && hasCover(post.cover) ? (
      <CoverMedia
        title={post.title}
        mode={post.coverMode}
        className="article-cover"
        src={post.cover}
      />
    ) : null;
  return (
    <header
      className={`article-opening ${cover ? "with-cover" : "without-cover"}`}
    >
      {design.headerLayout === "cover-first" && cover}
      <ArticleHeading post={post} theme={theme} actions={actions} />
      {design.headerLayout !== "cover-first" && cover}
    </header>
  );
}

function ArticleHeading({ theme, post, actions }: { theme: Theme; post: Post; actions?: ReactNode }) {
  const ownerProfile = useAuthorProfile();
  const profile =
    (theme as Partial<PublicTheme>).authorProfile ?? ownerProfile?.profile;
  const design = theme.article;
  return (
    <div className="article-heading">
      <div className="article-meta">
        {design.showDates && (
          <>
            <time dateTime={post.createdAt}>{date(post.createdAt)}</time>
            <span>·</span>
          </>
        )}
        {readingMinutes(post.content)} MIN READ
      </div>
      <h1>{post.title}</h1>
      {design.showTags && post.tags.length > 0 && (
        <div className="article-tags">
          {post.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
      {design.showExcerpt && post.excerpt && (
        <p className="article-deck">{post.excerpt}</p>
      )}
      <ArticleByline byline={profile} actions={actions} />
      {!post.simplified &&
        post.reviewedBy?.map((name, i) => (
          <p className="review-badge" key={i}>
            Reviewed by {name}
          </p>
        ))}
    </div>
  );
}

function ArticleByline({ byline, actions }: { byline?: AuthorProfile | null; actions?: ReactNode }) {
  if (!actions) return <PostByline byline={byline} />;
  return <div className="article-byline-actions"><PostByline byline={byline} />{actions}</div>;
}

function readingMinutes(content = "") {
  return Math.max(1, Math.ceil((content.match(/\S+/g)?.length || 0) / 200));
}
