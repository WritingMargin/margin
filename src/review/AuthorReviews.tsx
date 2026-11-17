import { useEffect, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { api, json } from "../api";
import NoteRevision from "./NoteRevision";
import AddressReviewNote from "./AddressReviewNote";
import ReviewerInvitationForm from "./ReviewerInvitationForm";
import type { Post } from "../../shared/types";
import type { PeerReview } from "./types";
import "./review.css";
import Empty from "../components/Empty";

export default function AuthorReviews({ post }: { post: Post }) {
  const path = "/posts/" + post.id + "/reviews";
  const [reviews, setReviews] = useState<PeerReview[]>([]);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [invitationStatus, setInvitationStatus] = useState({
    error: "",
    notice: "",
  });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!post.id) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<PeerReview[]>(path, { signal: controller.signal })
      .then((rows) => {
        if (!controller.signal.aborted) setReviews(rows);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, post.id, post.revision, version]);
  async function update(target: string, body: object) {
    if (busy) return;
    const inviting = target === path;
    setBusy(true);
    if (inviting) setInvitationStatus({ error: "", notice: "" });
    else {
      setError("");
      setNotice("");
    }
    try {
      await api(target, json("POST", body));
      if (inviting) {
        setInvitationStatus({
          error: "",
          notice: "Invitation sent to " + email + ".",
        });
        setEmail("");
      } else setNotice("Note linked to its fixing revision.");
      setVersion((v) => v + 1);
    } catch (e) {
      if (inviting)
        setInvitationStatus({ error: (e as Error).message, notice: "" });
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!post.id)
    return (
      <Empty
        icon={<Mail size={25} />}
        title="Save a draft to invite a reviewer."
        text="Save your article, then invite someone to review it privately."
      />
    );
  return (
    <div className="peer-author">
      <ReviewerInvitationForm
        email={email}
        setEmail={setEmail}
        busy={busy}
        archived={post.status === "archived"}
        status={invitationStatus}
        invite={() => void update(path, { email })}
      />
      <section className="peer-author-reviews" aria-label="Reviews">
        <div className="peer-section-heading">
          <h3>Reviews</h3>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh reviews"
            title="Refresh reviews"
            disabled={loading || busy}
            onClick={() => setVersion((v) => v + 1)}
          >
            <RefreshCw size={13} />
          </button>
        </div>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {loading && <p role="status">Loading reviews…</p>}
        {!loading && !error && !reviews.length && (
          <p className="muted peer-reviews-empty">No invitations yet.</p>
        )}
        {reviews.map((review) => (
          <article className="review-entry" key={review.id}>
            <strong>{review.reviewer_name || review.email}</strong>
            <p className="peer-review-status">
              {review.status}
              {review.closed && " · Closed"}
            </p>
            {review.notes.map((n) => (
              <article key={n.id} className="review-note">
                <blockquote>{n.quote}</blockquote>
                <p>{n.body}</p>
                {n.addressed_revision ? (
                  <NoteRevision postID={post.id} note={n} />
                ) : (
                  !review.closed && (
                    <AddressReviewNote
                      path={path + "/notes/" + n.id}
                      currentRevision={post.revision}
                      busy={busy}
                      address={(revision) =>
                        update(path + "/notes/" + n.id + "/address", {
                          revision,
                        })
                      }
                    />
                  )
                )}
              </article>
            ))}
          </article>
        ))}
      </section>
    </div>
  );
}
