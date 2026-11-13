import { useEffect, useState } from "react";
import { Mail, RefreshCw } from "lucide-react";
import { api, json } from "../api";
import NoteRevision from "./NoteRevision";
import AddressReviewNote from "./AddressReviewNote";
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
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(target, json("POST", body));
      if (target === path) {
        setNotice("Invitation sent to " + email + ".");
        setEmail("");
      } else setNotice("Note linked to its fixing revision.");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!post.id) return <Empty icon={<Mail size={25} />} title="Save a draft to invite a reviewer." text="Save your article, then invite someone to review it privately." />;
  return (
    <div className="peer-author">
      <h3>Invite a reviewer</h3>
      <p>
        Their invitation opens this draft only. You and the reviewer can read
        their notes.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void update(path, { email });
        }}
      >
        <label>
          Reviewer’s email address
          <input
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <ReviewInviteButton busy={busy} archived={post.status === "archived"} />
      </form>
      <div className="peer-section-heading">
        <h3>Reviews</h3>
        <button
          className="button"
          disabled={loading || busy}
          onClick={() => setVersion((v) => v + 1)}
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      {error && <p className="error-box" role="alert">{error}</p>}
      {loading && <p role="status">Loading reviews…</p>}
      {!loading && !error && !reviews.length && <Empty icon={<Mail size={25} />} title="No invitations yet." text="Invite a reviewer above to get feedback on this draft." />}
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
                      update(path + "/notes/" + n.id + "/address", { revision })
                    }
                  />
                )
              )}
            </article>
          ))}
        </article>
      ))}
    </div>
  );
}

function ReviewInviteButton({ busy, archived }: { busy: boolean; archived: boolean }) {
  return <button className="button primary" disabled={busy || archived}>
    <Mail size={14} />{busy ? "Working…" : "Send invitation"}
  </button>;
}
