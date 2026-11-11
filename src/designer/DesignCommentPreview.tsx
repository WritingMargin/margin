import { ArrowUpRight, Check } from "lucide-react";
import { type Comment, type Theme } from "../../shared/types";
import "../blog-design.css";
import { CommentFields, CommentsView } from "../PublicBlog";
import { sampleComments } from "./samples";
export default function DesignCommentPreview({
  theme: local,
  comments = sampleComments,
}: {
  theme: Theme;
  comments?: Comment[];
}) {
  return (
    <CommentsView theme={local} comments={comments}>
      <form
        className="preview-comment-form"
        onSubmit={(e) => e.preventDefault()}
      >
        <CommentFields
          hideEmail
          design={local.comments}
          values={{ name: "", email: "", body: "" }}
          disabled
        />
        <div className="preview-verification">
          <Check size={14} />
          CAPTCHA appears on your published blog
        </div>
        <button className="button primary" disabled>
          {local.comments.buttonLabel}
          <ArrowUpRight size={14} />
        </button>
        <p className="small-text">
          Comments appear after the owner approves them.
        </p>
      </form>
    </CommentsView>
  );
}
