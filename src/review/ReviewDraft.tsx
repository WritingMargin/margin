import { useState } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import type { PublicTheme } from "../../shared/frontend";
import { themeForContentType } from "../../shared/content-types";
import ArticleOpening from "../blog/ArticleOpening";
import { blogThemeStyle } from "../blog/theme";
import PostDiff from "../editor/PostDiff";
import NoteRevision from "./NoteRevision";
import ReviewPassages from "./ReviewPassages";
import type { ReviewVisit } from "./types";

type Props = {
  visit: ReviewVisit;
  path: string;
  theme: PublicTheme;
  loading: boolean;
  failure: Error | null;
  refresh: () => Promise<void>;
  mutate: (action: string, input: object) => Promise<void>;
};
export default function ReviewDraft({
  visit,
  path,
  theme,
  loading,
  failure,
  refresh,
  mutate,
}: Props) {
  const design = themeForContentType(theme, visit.post.contentType);
  const [notice, setNotice] = useState("");
  async function saveNote(
    body: string,
    quote: string,
    occurrence: number,
    submissionId: string,
  ) {
    await mutate("notes", { body, quote, occurrence, submissionId });
    setNotice("Review note saved.");
  }
  return (
    <main
      className={`peer-page public-article article-layout-${design.article.headerLayout || "standard"}`}
      data-measure={design.article.measure}
      data-spacing={design.article.spacing}
      data-heading-scale={design.article.headingScale}
      data-heading-style={design.article.headingStyle}
      data-quote-style={design.article.quoteStyle}
      style={blogThemeStyle(design)}
    >
      <p className="article-meta">Private peer review · {visit.status}</p>
      <ArticleOpening theme={design} post={visit.post} />
      {visit.previous && (
        <details className="peer-changes" open>
          <summary>Changes since your last visit</summary>
          <PostDiff before={visit.previous} after={visit.post} />
        </details>
      )}
      <p className="peer-instruction">
        Select a passage to leave a private note for the author.
      </p>
      <ReviewPassages
        post={visit.post}
        notes={visit.notes}
        saveNote={saveNote}
      />
      <section className="peer-notes" aria-labelledby="peer-notes-title">
        <div className="peer-section-heading">
          <h2 id="peer-notes-title">Review notes</h2>
          <button
            className="button"
            disabled={loading}
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} />
            Refresh review
          </button>
        </div>
        <p role="status">{loading ? "Checking for changes…" : notice}</p>
        {failure && <p role="alert">{failure.message}</p>}
        {visit.notes.map((n) => (
          <article
            className="review-note"
            key={n.id}
            id={"review-note-" + n.id}
            tabIndex={-1}
          >
            <blockquote>{n.quote}</blockquote>
            {n.anchorStatus === "earlier" && (
              <small>On an earlier revision</small>
            )}
            <p>{n.body}</p>
            {n.addressed_revision ? (
              <NoteRevision note={n} reviewPath={path} />
            ) : (
              <small>Open</small>
            )}
          </article>
        ))}
        {!visit.notes.length && <p>No review notes yet.</p>}
      </section>
      <ReviewApproval
        visit={visit}
        approve={(input) => mutate("approve", input)}
      />
    </main>
  );
}

function ReviewApproval({
  visit,
  approve,
}: {
  visit: ReviewVisit;
  approve: (input: object) => Promise<void>;
}) {
  const [badge, setBadge] = useState(Boolean(visit.badgeName));
  const [name, setName] = useState(visit.badgeName || visit.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const unresolved = !visit.canApprove;
  async function submit() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await approve({ name, badge });
      setNotice("Approval saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="peer-approval"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2>Approval</h2>
      {unresolved && (
        <p>Approval is available once the author addresses your open notes.</p>
      )}
      <label className="peer-consent">
        <input
          type="checkbox"
          checked={badge}
          onChange={(e) => setBadge(e.target.checked)}
        />
        Show “Reviewed by” on the published post
      </label>
      {badge && (
        <label>
          Public reviewer name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      <button className="button primary" disabled={busy || unresolved}>
        <CheckCheck size={15} />
        {busy
          ? "Saving approval…"
          : visit.status === "Approved"
            ? "Update approval"
            : "Approve this revision"}
      </button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
