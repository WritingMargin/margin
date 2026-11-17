import { sitePath } from "../base-path";
import { RefreshCw } from "lucide-react";
import type { PublicTheme } from "../../shared/frontend";
import { APIError } from "../api";
import { ReviewInviteContext } from "../citations/review-context";
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
      invite={invite}
    />
  );
}

function ReviewAccess({
  loading,
  failure,
  refresh,
  invite,
}: {
  loading: boolean;
  failure: Error | null;
  refresh: () => Promise<void>;
  invite: string;
}) {
  const status = failure instanceof APIError ? (failure.status ?? 0) : 0;
  const canSignIn = [401, 403, 404].includes(status ?? 0);
  return (
    <main className="peer-page peer-access">
      <h1>Peer review</h1>
      <ReviewAccessMessage loading={loading} status={status} failure={failure} />
      {canSignIn && <p><a className="button" href={sitePath("/admin") + "?next=" + encodeURIComponent(sitePath(`/review/${invite}`))}>Sign in to this publication</a> using the invited email address. If you have not accepted yet, open the invitation email first.</p>}
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
