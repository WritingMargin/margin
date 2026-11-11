import { useEffect, useState } from "react";
import { api } from "../api";
import { date } from "../admin/post-utils";
import { LockKeyhole, Mail, UsersRound } from "lucide-react";
import Empty from "../components/Empty";
import "./subscribers.css";
type Subscriber = {
  email: string;
  status: "subscribed" | "pending" | "unsubscribed";
  created_at: string;
  confirmed_at: string | null;
};
type Page = { subscribers: Subscriber[]; hasMore: boolean };
export default function Subscribers() {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPage(null);
    setError("");
    api<Page>(`/readers/subscribers?offset=${offset}`, {
      signal: controller.signal,
    })
      .then(setPage)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [offset, attempt]);
  return (
    <section className="settings-card reader-subscribers">
      <header className="subscriber-header">
        <span className="settings-icon" aria-hidden="true">
          <UsersRound size={20} />
        </span>
        <div>
          <h2>Your subscribers</h2>
          <p>The readers who have signed up for your newsletter.</p>
        </div>
      </header>
      <div className="subscriber-content">
        {error ? (
          <div className="error-box" role="alert">
            {error}
            <button
              className="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </button>
          </div>
        ) : !page ? (
          <p role="status">Loading subscribers…</p>
        ) : (
          <>
            {page.subscribers.length === 0 ? (
              <Empty
                icon={<Mail size={25} strokeWidth={1.4} />}
                title={
                  offset
                    ? "No subscribers on this page."
                    : "Your audience starts here."
                }
                text={
                  offset
                    ? "Return to the previous page to see your subscribers."
                    : "Readers who subscribe to your newsletter will appear here, with their confirmation status and join date."
                }
              />
            ) : (
              <div className="reader-table">
                <table>
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Confirmed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.subscribers.map((reader) => (
                      <tr key={reader.email}>
                        <td>{reader.email}</td>
                        <td>
                          <span
                            className="status-pill"
                            data-status={reader.status}
                          >
                            {
                              {
                                subscribed: "Confirmed",
                                pending: "Pending",
                                unsubscribed: "Unsubscribed",
                              }[reader.status]
                            }
                          </span>
                        </td>
                        <td>{date(reader.created_at)}</td>
                        <td>
                          {reader.confirmed_at
                            ? date(reader.confirmed_at)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(offset > 0 || page.hasMore) && (
              <div className="reader-pagination">
                <button
                  className="button"
                  disabled={!offset}
                  onClick={() => setOffset((value) => Math.max(0, value - 100))}
                >
                  Previous
                </button>
                <span>Page {offset / 100 + 1}</span>
                <button
                  className="button"
                  disabled={!page.hasMore}
                  onClick={() => setOffset((value) => value + 100)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <footer className="subscriber-privacy">
        <LockKeyhole size={14} aria-hidden="true" />
        <p>
          Private reader notes are never visible here.
        </p>
      </footer>
    </section>
  );
}
