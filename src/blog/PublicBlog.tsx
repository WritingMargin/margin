import {
  resolveContentType,
  themeForContentType,
} from "../../shared/content-types";
import type { HomepagePage } from "../../shared/homepage";
import type { Comment, Post } from "../../shared/types";
import type { PublicTheme } from "../../shared/frontend";
import "../blog-design.css";
import { NewsletterSignup, NewsletterSubscription } from "../Newsletter";
import ReviewerPage from "../review/ReviewerPage";
import ReaderSignIn from "./ReaderSignIn";
import CommentEmailVerification from "./CommentEmailVerification";
import RelatedPosts from "./RelatedPosts";
import { BlogArticle } from "./BlogArticle";
import { BlogFrame } from "./BlogFrame";
import { BlogHomepage } from "./BlogHomepage";
import { PublicComments } from "./PublicComments";
import { usePageAnalytics } from "../analytics/usePageAnalytics";

export type PublicBlogProps = {
  theme: PublicTheme;
  preview?: boolean;
  reviewInvite?: string;
  posts?: Post[];
  homepage?: HomepagePage;
  post?: Post;
  comments?: Comment[];
  relatedPosts?: Post[];
  readerSignIn?: boolean;
  commentVerification?: boolean;
  newsletterAction?: "confirm" | "unsubscribe";
};

export function PublicBlog({
  theme,
  posts = [],
  homepage,
  post,
  comments = [],
  relatedPosts = [],
  newsletterAction,
  commentVerification,
  readerSignIn,
  preview,
  reviewInvite,
}: PublicBlogProps) {
  usePageAnalytics(
    post,
    preview || hasPublicAction(newsletterAction, commentVerification, readerSignIn, reviewInvite),
  );
  theme = themeForContentType(
    theme,
    resolveContentType(post?.contentType),
  ) as PublicTheme;
  return (
    <BlogFrame
      theme={theme}
      pwa={theme.pwa}
      section={publicSection(post,reviewInvite)}
    >
      {reviewInvite ? <ReviewerPage key={reviewInvite} invite={reviewInvite} theme={theme}/> : hasPublicAction(undefined, commentVerification, readerSignIn) ? (
        <ReaderAction signIn={readerSignIn} />
      ) : newsletterAction ? (
        <NewsletterSubscription
          action={newsletterAction}
          publicationName={theme.name}
        />
      ) : (
        <PublicContent
          theme={theme}
          post={post}
          posts={posts}
          homepage={homepage}
          comments={comments}
          relatedPosts={relatedPosts}
          preview={preview}
        />
      )}
    </BlogFrame>
  );
}

function PublicContent({
  theme,
  post,
  posts,
  homepage,
  comments,
  relatedPosts,
  preview,
}: PublicBlogProps) {
  return (
    <>
      {preview && (
        <p role="status">Draft preview — only visible to signed-in admins.</p>
      )}
      {post ? (
        <BlogArticle theme={theme} post={post} floatingChecklists saveGuideProgress={!preview}>
          <RelatedPosts posts={relatedPosts ?? []} theme={theme} />
          {!preview && (
            <PublicComments
              postId={post.id}
              siteKey={theme.captchaSiteKey || ""}
              theme={theme}
              initialComments={comments ?? []}
            />
          )}
        </BlogArticle>
      ) : (
        <BlogHomepage theme={theme} posts={posts ?? []} homepage={homepage} />
      )}
      {!preview && <NewsletterSignup publicationName={theme.name} />}
    </>
  );
}

function hasPublicAction(
  newsletterAction?: string,
  commentVerification?: boolean,
  readerSignIn?: boolean,
  reviewInvite?: string,
) {
  return Boolean(newsletterAction || commentVerification || readerSignIn || reviewInvite);
}

function ReaderAction({ signIn }: { signIn?: boolean }) {
  return signIn ? <ReaderSignIn /> : <CommentEmailVerification />;
}

function publicSection(post?:Post,invite?:string){ return post || invite ? "article" : "homepage"; }
