import CommentRules from "./CommentRules";
import { commentsOpen } from "../../shared/interactions";
import type { PublicTheme } from "../../shared/frontend";
import { usePublicComments } from "./usePublicComments";
import { CommentFields } from "./CommentFields";
import ReaderAuth, { ReaderSession } from "./ReaderAuth";
export default function PassageQuestionForm({
  postId,
  theme,
  quote,
  occurrence = 0,
  revision,
}: {
  postId: string;
  theme: PublicTheme;
  quote: string;
  occurrence?: number;
  revision: string;
}) {
  const state = usePublicComments({
    postId,
    theme,
    siteKey: theme.captchaSiteKey || "",
    question: { quote, revision, occurrence },
  });
  if (!commentsOpen(theme, theme.captchaSiteKey)) return null;
  return (
    <ReaderAuth auth={state.auth} prompt="Sign in to ask a question." showSession={false}>
      <form onSubmit={state.submit}>
        <CommentFields
          hideEmail
          hideName={Boolean(state.auth.reader?.name)}
          disabled={state.busy}
          design={{
            ...theme.comments,
            bodyLabel: "Your question",
            placeholder: "What are you wondering about?",
          }}
          values={state.values}
          onChange={state.changeField}
        />

        <div className="comment-form-actions">
          <button className="button primary" disabled={state.busy}>
            {state.busy ? "Sending…" : "Ask a question"}
          </button>
          <ReaderSession auth={state.auth} />
        </div>
        <CommentRules policy={theme.commentPolicy} />
        {state.message && (
          <p className="passage-status" role="status">
            {state.message}
          </p>
        )}
      </form>
    </ReaderAuth>
  );
}
