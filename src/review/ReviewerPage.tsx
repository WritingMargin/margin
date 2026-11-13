import { useEffect, useState } from "react";
import { sitePath } from "../base-path";
import { RefreshCw } from "lucide-react";
import type { PublicTheme } from "../../shared/frontend";
import { api, APIError } from "../api";
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
  const [cloud, setCloud] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ cloudManaged?: boolean; teamConnected?: boolean }>("/session").then(session => setCloud(Boolean(session.teamConnected || session.cloudManaged))).catch(() => setCloud(null));
  }, []);
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
      cloud={cloud}
      invite={invite}
    />
  );
}

function ReviewAccess({
  loading,
  failure,
  refresh,
  auth,
  cloud,
  invite,
}: {
  loading: boolean;
  failure: Error | null;
  refresh: () => Promise<void>;
  auth: CommentAuth;
  cloud: boolean | null;
  invite: string;
}) {
  const status = failure instanceof APIError ? (failure.status ?? 0) : 0;
  const canSignIn = [401, 403, 404].includes(status ?? 0);
  return (
    <main className="peer-page peer-access">
      <h1>Peer review</h1>
      <ReviewAccessMessage loading={loading} status={status} failure={failure} />
      {canSignIn && cloud && <p><a className="button" href={sitePath("/admin") + "?next=" + encodeURIComponent(sitePath(`/review/${invite}`))}>Sign in with Margin</a> using the invited email address. If you have not accepted yet, open the invitation email first.</p>}
      {canSignIn && cloud === false && <ReaderAuth auth={auth} prompt="Sign in with the email address that received the invitation.">
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

function ReviewAccessMessage({ loading, status, failure }: { loading: boolean; status: number | undefined; failure: Error | null }) {
  const failed = !loading && Boolean(failure);
  return <p className={failed ? "error-box" : undefined} role={failed ? "alert" : "status"}>{accessMessage(loading, status, failure)}</p>;
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
