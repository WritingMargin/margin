import { Fragment, type CSSProperties, type ReactNode } from "react";
import { type Comment, type Theme } from "../../shared/types";
import "../blog-design.css";
import { date } from "./theme";
import { ConversationToolsSlot } from "./ConversationTools";
export function CommentsView({
  theme,
  comments,
  children,
}: {
  theme: Theme;
  comments: Comment[];
  children?: ReactNode;
}) {
  const design = theme.comments;
  if (!design.visible || !design.enabled) return null;
  const color = design.background.slice(1);
  const luminance = [0, 2, 4].reduce(
    (sum, offset, i) =>
      sum +
      parseInt(color.slice(offset, offset + 2), 16) *
        [0.2126, 0.7152, 0.0722][i],
    0,
  );
  const ink = luminance < 140 ? "#f5f5f5" : "#333333";
  return (
    <section
      id="comments"
      className={`public-comments comments-layout-${design.layout}`}
      style={
        {
          "--theme-border": design.border === "bold" ? "#242424" : "#e5e5e2",
          "--radius": `${design.radius}px`,
          "--comments-background": design.background,
          "--comment-ink": ink,
        } as CSSProperties
      }
    >
      <span className="eyebrow">IN THE MARGINS</span>
      <div className="conversation-heading">
        <h2>{design.heading}</h2>
        <ConversationToolsSlot />
      </div>
      {design.introduction && (
        <p className="comments-introduction">{design.introduction === "A good story is the beginning of a conversation. Leave a thoughtful note." ? "A good story is the beginning of a conversation. Leave a thoughtful comment." : design.introduction}</p>
      )}
      <div className="reader-comments">
        {comments.map((c) => (
          <article key={c.id} className="reader-comment">
            <div className="reader-comment-header">
              {design.showAvatars && (
                <span className="reader-avatar" aria-hidden="true">
                  {c.name.charAt(0).toUpperCase()}
                </span>
              )}
              <strong>{c.name}</strong>
              {design.showDates && (
                <time dateTime={c.createdAt}>{date(c.createdAt)}</time>
              )}
            </div>
            {c.quote && (
              <blockquote className="comment-passage">
                <span>
                  {c.anchor_status === "detached"
                    ? "Original passage · text has changed"
                    : "On this passage"}
                </span>
                <p>{c.quote}</p>
              </blockquote>
            )}
            <p>{c.body}</p>
            {(c.answer || !!c.followups?.length) && <div className="comment-thread">
              {c.answer && <div className="comment-thread-entry"><strong>Author</strong><span> replied</span><p>{c.answer}</p></div>}
              {c.followups?.map((followup) => <Fragment key={followup.id}>
                <div className="comment-thread-entry"><strong>{c.name}</strong><span> replied to author</span><p>{followup.body}</p></div>
                {followup.answer && <div className="comment-thread-entry"><strong>Author</strong><span> replied to {c.name}</span><p>{followup.answer}</p></div>}
              </Fragment>)}
            </div>}
          </article>
        ))}
      </div>
      {children}
    </section>
  );
}
