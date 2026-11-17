import Accordion from "../Accordion";
import ConnectedApps from "../admin/ConnectedApps";
import { useEffect, useState } from "react";
import { api } from "../api";
import { sitePath } from "../base-path";
import type { TeamUser } from "../../shared/team";
import { BookOpen, LogOut } from "lucide-react";
import PageHeading from "../components/PageHeading";
import Empty from "../components/Empty";
import "./team.css";
type Review = {
  id: string;
  postId: string;
  title: string;
  status: string;
  url: string;
};
export default function ReviewerWorkspace({
  user,
  logout,
}: {
  user?: TeamUser;
  logout: () => Promise<void>;
}) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setReviews(null);
    api<Review[]>("/public/team/reviews", { signal: controller.signal })
      .then(rows => { if (!controller.signal.aborted) setReviews(rows); })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <section className="page-content">
      <PageHeading
        label="YOUR WORKSPACE"
        title="Your peer reviews"
        description="These are the articles you have been invited to review in this publication."
        action={
          <button
            className="button"
            onClick={() =>
              void logout().catch((cause) => setError(cause.message))
            }
          >
            <LogOut size={15} />
            Sign out
          </button>
        }
      />
      <section className="settings-card">
        <div className="settings-icon" aria-hidden="true">
          <BookOpen />
        </div>
        <h2>Assigned articles</h2>
        <ReviewerIdentity user={user} />
        {error && (
          <p className="error-box" role="alert">
            {error}{" "}
            <button
              className="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </button>
          </p>
        )}
        {!reviews && !error && <p role="status">Loading your invitations…</p>}
        {reviews?.length === 0 && (
          <Empty
            icon={<BookOpen size={25} strokeWidth={1.4} />}
            title="No active article invitations."
            text="Articles assigned to you for review will appear here."
          />
        )}
        <ul className="team-list">
          {reviews?.map((review) => (
            <li key={review.id}>
              <div className="team-person">
                <strong>{review.title}</strong>
                <small className="muted">{review.status}</small>
              </div>
              <a
                className="button"
                href={sitePath(`/review/${encodeURIComponent(review.id)}`)}
              >
                Open review
              </a>
            </li>
          ))}
        </ul>
      </section>
      <Accordion title="Connected apps"><ConnectedApps /></Accordion>
    </section>
  );
}

function ReviewerIdentity({ user }: { user?: TeamUser }) {
  return <><p>{user?.name || user?.email}</p>{user?.name && <p className="small-text muted">{user.email}</p>}</>;
}
