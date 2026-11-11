import { RefreshCw } from "lucide-react";
import type { PublicTheme } from "../../shared/frontend";
import { APIError } from "../api";
import { ReviewInviteContext } from "../citations/review-context";
import ReaderAuth from "../blog/ReaderAuth";
import { useCommentAuth, type CommentAuth } from "../blog/useCommentAuth";
import ReviewDraft from "./ReviewDraft";
import { useReviewVisit } from "./useReviewVisit";
import "./review.css";

export default function ReviewerPage({
  invite,
  theme,
}: {
  invite: string;
  theme: PublicTheme;
}) {
  const path = "/public/reviews/" + encodeURIComponent(invite);
  const state = useReviewVisit(path);
  const auth = useCommentAuth();
  if (state.visit)
    return (
      <ReviewInviteContext.Provider value={invite}>
        <ReviewDraft
          key={state.visit.post.revision}
          visit={state.visit}
          theme={theme}
          path={path}
          refresh={state.refresh}
          loading={state.loading}
          failure={state.failure}
          mutate={state.mutate}
        />
      </ReviewInviteContext.Provider>
    );
  return (
    <ReviewAccess
      loading={state.loading}
      failure={state.failure}
      refresh={state.refresh}
      auth={auth}
    />
  );
}

function ReviewAccess({
  loading,
  failure,
  refresh,
  auth,
}: {
  loading: boolean;
  failure: Error | null;
  refresh: () => Promise<void>;
  auth: CommentAuth;
}) {
  const status = failure instanceof APIError ? failure.status : 0;
  const canSignIn = [401, 403, 404].includes(status ?? 0);
  return (
    <main className="peer-page peer-access">
      <h1>Peer review</h1>
      <p role="status">{accessMessage(loading, status, failure)}</p>
      {canSignIn && <ReaderAuth auth={auth} prompt="Sign in with the email address that received the invitation.">
        <p className="small-text">If this isn’t the invited account, sign out and use the invited email address.</p>
      </ReaderAuth>}
      {failure && !canSignIn && (
        <button
          className="button"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} />
          Retry invitation
        </button>
      )}
    </main>
  );
}

function accessMessage(
  loading: boolean,
  status: number | undefined,
  failure: Error | null,
) {
  if (loading) return "Opening invitation…";
  if (status === 401)
    return "Sign in to open this invitation.";
  return failure?.message;
}
