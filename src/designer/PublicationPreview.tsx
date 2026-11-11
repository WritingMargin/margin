import { resolveContentType, themeForContentType } from "../../shared/content-types";
import type { MouseEvent } from "react";
import { BlogArticle, BlogFrame, BlogHomepage } from "../PublicBlog";
import type { Theme } from "../../shared/types";
import type { DesignSection } from "../admin-route";
import { sitePath } from "../base-path";
import DesignCommentPreview from "./DesignCommentPreview";
import Select from "../components/Select";
import type { PublicationPreviewContent } from "./usePublicationPreview";

export function PreviewPostChoice({ content }: { content: PublicationPreviewContent }) {
  if (!content.posts.length) return null;
  return <label className="preview-post-choice">Preview content
    <Select value={content.selectedSlug} onChange={event => content.select(event.target.value)}>
      {content.posts.map(post => <option value={post.slug} key={post.id}>{post.title}</option>)}
    </Select>
  </label>;
}

export default function PublicationPreview({ theme, section, content, onNavigate }: { theme: Theme; section: DesignSection; content: PublicationPreviewContent; onNavigate?: (section: DesignSection) => void }) {
  const navigate = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute("href");
    if (href?.startsWith("#")) {
      Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[id]")).find(element => element.id === href.slice(1))?.scrollIntoView({ block: "start" });
      return;
    }
    const post = content.posts.find(item => sitePath(`/post/${encodeURIComponent(item.slug)}`) === href);
    if (post) { content.select(post.slug); onNavigate?.(resolveContentType(post.contentType)); }
    else if (href === sitePath("/")) onNavigate?.("homepage");
  };
  return <div className={section === "footer" ? "footer-preview-frame" : undefined} onClickCapture={navigate}>
    <BlogFrame theme={themeForContentType(theme, section === "homepage" || section === "comments" || section === "footer" ? "article" : section)} preview section={section === "homepage" || section === "footer" ? "homepage" : "article"}>
      <PreviewBody theme={theme} section={section} content={content} />
    </BlogFrame>
  </div>;
}

function PreviewBody({ theme, section, content }: { theme: Theme; section: DesignSection; content: PublicationPreviewContent }) {
  if (section === "footer") return <main className="footer-only-preview"><span className="eyebrow">PUBLICATION PREVIEW</span><h2>{theme.name}</h2><p>Your footer closes every public page.</p></main>;
  if (content.loading) return <PreviewMessage message="Loading your published posts…" />;
  if (content.error) return <PreviewMessage message={content.error} retry={content.retry} />;
  if (section === "homepage") return <BlogHomepage theme={theme} posts={content.posts} preview />;
  if (!content.posts.length) return <PreviewMessage message="No published posts yet." detail="Your published stories will appear here with your current design. Drafts stay private." />;
  if (content.articleError) return <PreviewMessage message={content.articleError} retry={content.retry} />;
  if (!content.post) return <PreviewMessage message="Loading article…" />;
  if (section === "comments") return <CommentsPreview theme={theme} content={content} />;
  return <BlogArticle theme={theme} post={{ ...content.post, contentType: section, status: "draft" }}>
    <DesignCommentPreview theme={theme} comments={content.comments} />
  </BlogArticle>;
}

function PreviewMessage({ message, detail, retry }: { message: string; detail?: string; retry?: () => void }) {
  return <div className="publication-preview-message" role={retry ? "alert" : "status"}>
    <h3>{message}</h3>{detail && <p>{detail}</p>}{retry && <button className="button" onClick={retry}>Retry preview</button>}
  </div>;
}

function CommentsPreview({ theme, content }: { theme: Theme; content: PublicationPreviewContent }) {
  if (!theme.comments.visible || !theme.comments.enabled) return <PreviewMessage message="Comments are hidden or closed." detail="This design will not show a comments section." />;
  return <main className="comments-only-preview"><DesignCommentPreview theme={theme} comments={content.comments} /></main>;
}
