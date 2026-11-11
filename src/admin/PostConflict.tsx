import { useEffect, useRef, useState } from "react";
import { GitCompareArrows, X } from "lucide-react";
import type { Post } from "../../shared/types";
import { authorLabel, type RevisionAuthor } from "../../shared/revisions";
import {
  conflictFields,
  fieldValue,
  resolvedPost,
  type Resolutions,
  type ReviewField,
} from "../../shared/post-conflicts";
import { api } from "../api";
import PostDiff from "../editor/PostDiff";
import { useOverlayFocus } from "../useOverlayFocus";
import type { ConflictSession } from "./usePostConflicts";
import "./revision-history.css";
import "./post-conflict.css";

type RemotePost = Post & { author: RevisionAuthor };
type Props = {
  session: ConflictSession;
  onApply: (post: Post, remote: Post) => void;
  onClose: () => void;
};
export default function PostConflict(props: Props) {
  const panel = useRef<HTMLElement>(null);
  useOverlayFocus(panel, true, props.onClose);
  const [remote, setRemote] = useState<RemotePost | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRemote(null);
    setError("");
    api<RemotePost>(`/posts/${encodeURIComponent(props.session.local.id)}`)
      .then((post) => {
        if (active) setRemote(post);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [props.session, retry]);
  return (
    <div className="modal-backdrop">
      <section
        ref={panel}
        className="revision-dialog conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
      >
        <header className="revision-header">
          <div>
            <span className="eyebrow">
              <GitCompareArrows size={14} /> YOUR EDITS ARE STILL HERE
            </span>
            <h2 id="conflict-title">Review conflicting changes</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close conflict review"
            onClick={props.onClose}
          >
            <X size={19} />
          </button>
        </header>
        {remote ? (
          <ConflictReview key={remote.revision} {...props} remote={remote} />
        ) : (
          <div className="conflict-scroll">
            {error ? (
              <div className="error-box" role="alert">
                {error}
                <button
                  className="button"
                  onClick={() => setRetry((n) => n + 1)}
                >
                  Try again
                </button>
              </div>
            ) : (
              <p role="status">
                Opening the latest saved version. Your draft stays unchanged.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
function ConflictReview({
  session,
  remote,
  onApply,
}: Props & { remote: RemotePost }) {
  const [choices, setChoices] = useState<Resolutions>({});
  const [edited, setEdited] = useState(session.local.content ?? "");
  const [view, setView] = useState<"mine" | "incoming" | "compare">("compare");
  const conflicts = conflictFields(session.base, session.local, remote);
  const unresolved = conflicts.filter(([key]) => !choices[key]).length;
  const pick = (key: ReviewField, choice: Resolutions[ReviewField]) =>
    setChoices((old) => ({ ...old, [key]: choice }));
  function apply() {
    onApply(
      resolvedPost(session.base, session.local, remote, choices, edited),
      remote,
    );
  }
  return (
    <>
      <div className="conflict-scroll">
        <p className="conflict-intro">
          A newer version was saved by{" "}
          <strong>{authorLabel(remote.author)}</strong>. Review it alongside
          your unsaved work. Nothing will be saved until you return to the
          editor and save.
        </p>
        <div
          className="revision-view-tabs"
          role="group"
          aria-label="Compare changes"
        >
          <button
            className="button"
            aria-pressed={view === "compare"}
            onClick={() => setView("compare")}
          >
            Latest → yours
          </button>
          <button
            className="button"
            aria-pressed={view === "mine"}
            onClick={() => setView("mine")}
          >
            Your changes
          </button>
          <button
            className="button"
            aria-pressed={view === "incoming"}
            onClick={() => setView("incoming")}
          >
            Incoming changes
          </button>
        </div>
        <PostDiff
          before={view === "compare" ? remote : session.base}
          after={view === "incoming" ? remote : session.local}
        />
        <h3 className="conflict-section-title">Resolve shared edits</h3>
        <p className="conflict-intro">
          Fields changed on only one side are kept automatically. Choose what to
          keep where both sides edited the same field. Publication status stays
          as currently saved.
        </p>
        {!conflicts.length && (
          <p className="conflict-clear">
            No overlapping fields. Your edits and the incoming changes can be
            combined.
          </p>
        )}
        {conflicts.map(([key, label]) => (
          <section
            className="conflict-field"
            key={key}
            aria-label={`Resolve ${label}`}
          >
            <header>
              <h4>{label}</h4>
              <span>{choices[key] ? "Reviewed" : "Needs a choice"}</span>
            </header>
            <details>
              <summary>Read both versions</summary>
              <div className="conflict-texts">
                <div>
                  <h5>Your unsaved version</h5>
                  <pre>{fieldValue(session.local, key)}</pre>
                </div>
                <div>
                  <h5>Latest saved version</h5>
                  <pre>{fieldValue(remote, key)}</pre>
                </div>
              </div>
            </details>
            <div className="revision-view-tabs">
              <button
                className="button"
                aria-pressed={choices[key] === "mine"}
                onClick={() => pick(key, "mine")}
              >
                Use mine
              </button>
              <button
                className="button"
                aria-pressed={choices[key] === "latest"}
                onClick={() => pick(key, "latest")}
              >
                Use latest
              </button>
            </div>
            {key === "content" && (
              <details className="conflict-edit">
                <summary>Combine the text yourself</summary>
                <label>
                  Combined Markdown
                  <textarea
                    value={edited}
                    onChange={(e) => {
                      setEdited(e.target.value);
                      pick("content", undefined);
                    }}
                    rows={12}
                  />
                </label>
                <button
                  className="button"
                  aria-pressed={choices.content === "edited"}
                  onClick={() => pick("content", "edited")}
                >
                  Use combined text
                </button>
              </details>
            )}
          </section>
        ))}
      </div>
      <footer className="revision-footer">
        <p>
          {unresolved
            ? `${unresolved} conflicting field${unresolved === 1 ? "" : "s"} still ${unresolved === 1 ? "needs" : "need"} review.`
            : "Ready to apply. Your original unsaved draft remains recoverable until you save."}
        </p>
        <button
          className="button primary"
          disabled={unresolved > 0}
          onClick={apply}
        >
          Apply reviewed changes
        </button>
      </footer>
    </>
  );
}
