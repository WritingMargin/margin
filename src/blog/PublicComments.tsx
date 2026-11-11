import CommentRules from "./CommentRules";
import { commentsOpen } from "../../shared/interactions";
import { ArrowUpRight } from "lucide-react";
import "../blog-design.css";
import { CommentFields } from "./CommentFields";
import ReaderAuth, { ReaderSession } from "./ReaderAuth";
import { CommentsView } from "./CommentsView";
import { usePublicComments } from "./usePublicComments";
export function PublicComments(props: Parameters<typeof usePublicComments>[0]) {
  if (!commentsOpen(props.theme, props.siteKey)) return null;
  return <VisibleComments {...props} />;
}
function VisibleComments(props: Parameters<typeof usePublicComments>[0]) {
  const state = usePublicComments(props);
  const {
    submit,
    theme,
    design,
    comments,
    values,
    changeField,
    message,
    busy,
  } = state;
  return (
    <CommentsView theme={theme} comments={comments}>
      <ReaderAuth auth={state.auth} prompt="Sign in to leave a comment." showSession={false}>
          <form onSubmit={submit}>
            <CommentFields
              hideEmail
              hideName={Boolean(state.auth.reader?.name)}
              disabled={busy}
              design={design}
              values={values}
              onChange={changeField}
            />

            <div className="comment-form-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "Sending…" : design.buttonLabel}
                <ArrowUpRight size={15} />
              </button>
              <ReaderSession auth={state.auth} />
            </div>
            <CommentRules policy={theme.commentPolicy} />
          </form>
      </ReaderAuth>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </CommentsView>
  );
}
