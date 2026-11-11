import { contentTypeLabel, resolveContentType, themeForContentType } from "../../shared/content-types";
import PassageInteractions from "./PassageInteractions";
import { PollPostContext } from "../blocks/Poll";
import type { PublicTheme } from "../../shared/frontend";
import { publicationCopy } from "../../shared/publication";
import { sitePath } from "../base-path";
import {
  ArrowLeft,
} from "lucide-react";
import { type ReactNode } from "react";
import { type Post, type Theme } from "../../shared/types";
import "../blog-design.css";
import Markdown from "../Markdown";
import GuideProgress from "./GuideProgress";
import ArticleOpening from "./ArticleOpening";
import ArticleDownloads from "./ArticleDownloads";
import { blogThemeStyle } from "./theme";
import ArticleShare from "./ArticleShare";
import SimplifiedContent from "./SimplifiedContent";
import { ConversationToolsProvider } from "./ConversationTools";
import { ReaderAuthProvider } from "./useCommentAuth";
export function BlogArticle({
  theme,
  post,
  children,
  floatingChecklists = false,
  saveGuideProgress = false,
}: {
  theme: Theme;
  post: Post;
  children?: ReactNode;
  floatingChecklists?: boolean;
  saveGuideProgress?: boolean;
}) {
  const type = resolveContentType(post.contentType);
  theme = themeForContentType(theme, type);
  const words = publicationCopy(theme.publicationType);
  const layout = articleLayout(theme);
  return (
    <ReaderAuthProvider><ConversationToolsProvider>
      <main data-content-type={type} data-heading-scale={layout.headingScale} data-spacing={layout.spacing} data-measure={layout.measure} data-heading-style={layout.headingStyle} data-quote-style={layout.quoteStyle} className={`public-article article-layout-${layout.headerLayout}`} style={blogThemeStyle(theme)}>
        <div className="article-topbar">
          <a className="back-link" href={sitePath("/")}>
            <ArrowLeft size={14} />
            All {words.plural}
          </a>
          <ReadingViewSwitch post={post} />
        </div>
        <ReadingViewDisclosure post={post} />
        <ArticleOpening theme={theme} post={post} actions={post.status === "published" && <div className="article-actions article-actions-opening">
          <ArticleShare key={`opening-${post.slug}`} post={post} publicUrl={(theme as Partial<PublicTheme>).publicUrl} />
          <ArticleDownloads post={post} singular={contentTypeLabel(type, theme.publicationType).toLowerCase()} />
        </div>} />
        <ArticleContent post={post} theme={theme} floatingChecklists={floatingChecklists} saveGuideProgress={saveGuideProgress} />
        {post.status === "published" && <div className="article-actions article-actions-ending">
          <ArticleShare key={`ending-${post.slug}`} post={post} publicUrl={(theme as Partial<PublicTheme>).publicUrl} />
          <ArticleDownloads post={post} singular={contentTypeLabel(type, theme.publicationType).toLowerCase()} />
        </div>}
        {children}
      </main>
    </ConversationToolsProvider></ReaderAuthProvider>
  );
}

function articleLayout(theme: Theme) {
  const article = theme.article;
  return {
    headingScale: article.headingScale ?? "standard", spacing: article.spacing ?? "standard",
    measure: article.measure ?? "auto", headingStyle: article.headingStyle ?? "plain",
    quoteStyle: article.quoteStyle ?? "border", headerLayout: article.headerLayout ?? "standard",
  };
}

function ReadingViewSwitch({ post }: { post: Post }) {
  if (post.status !== "published" || !post.simplifiedAvailable) return null;
  const standard = sitePath(`/post/${encodeURIComponent(post.slug)}?view=standard`);
  const simplified = sitePath(`/post/${encodeURIComponent(post.slug)}/simplified`);
  return <nav className="reading-view-switch" aria-label="Article version"><div>
      <a href={standard} aria-current={post.simplified ? undefined : "page"}>Standard</a>
      <a href={simplified} aria-current={post.simplified ? "page" : undefined}>Simplified</a>
    </div></nav>;
}

function ReadingViewDisclosure({ post }: { post: Post }) {
  if (!post.simplified) return null;
  const standard = sitePath(`/post/${encodeURIComponent(post.slug)}?view=standard`);
  return <p className="simplified-disclosure">AI-generated simplified version{post.simplifiedReviewed ? " · Reviewed by the writer" : ""}. <a href={standard}>Read the full article</a>.</p>;
}

function ArticleContent({ post, theme, floatingChecklists, saveGuideProgress }: { post: Post; theme: Theme; floatingChecklists: boolean; saveGuideProgress: boolean }) {
  if (post.simplified) return <SimplifiedContent content={post.content || ""} />;
  const content = <Markdown key={post.id} floatingChecklists={floatingChecklists} content={post.content || ""} tableOfContents={post.tableOfContents} contentsDesign={theme.article.tableOfContents} />;
  if (post.status !== "published") return content;
  const interactive = <PollPostContext.Provider value={{ id: post.id, revision: post.revision || "" }}><PassageInteractions post={post} theme={theme as PublicTheme}>{content}</PassageInteractions></PollPostContext.Provider>;
  if (saveGuideProgress && post.contentType === "guide") return <GuideProgress key={post.id} id={post.id} revision={post.revision || ""}>{interactive}</GuideProgress>;
  return interactive;
}
