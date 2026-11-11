import { contentTypeLabel } from "../../shared/content-types";
import { useRef, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import type { PostRevision } from "../../shared/revisions";
import PostDiff, { emptyComparison } from "../editor/PostDiff";
import { authorLabel, revisionFields } from "../../shared/revisions";
import Markdown from "../Markdown";
import { useOverlayFocus } from "../useOverlayFocus";
import type { AdminController } from "./useAdminController";
import { useRevisionHistory } from "./useRevisionHistory";
import "./revision-history.css";

type Props = {
  state: Pick<
    AdminController,
    "post" | "dirty" | "busy" | "change" | "setModal" | "notify"
  >;
};
export default function RevisionHistory({ state }: Props) {
  const { post, dirty, busy, change, setModal, notify } = state;
  const close = () => setModal(null);
  const panel = useRef<HTMLElement>(null);
  useOverlayFocus(panel, true, close);
  const history = useRevisionHistory(post.id);
  const current = history.selected === post.revision;
  const canRestore = !!history.version && !current && !dirty && !busy;
  function restore() {
    if (!canRestore || !history.version) return;
    change(revisionFields(history.version));
    close();
    notify(
      `Version ${history.version.version} loaded into the editor. Review it, then save to keep it.`,
    );
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={panel}
        className="revision-dialog editor-button-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revision-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="revision-header">
          <div>
            <span className="eyebrow">
              <History size={13} /> YOUR WRITING, OVER TIME
            </span>
            <h2 id="revision-history-title">Revision history</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close revision history"
            onClick={close}
          >
            <X size={19} />
          </button>
        </header>
        <div className="revision-body">
          <RevisionList history={history} currentRevision={post.revision} />
          <RevisionDetail key={history.selected} history={history} />
        </div>
        <footer className="revision-footer">
          <p>
            {dirty
              ? "Save your current edits before loading an earlier version."
              : "Loading a version changes the editor only. Your saved versions remain in history."}
          </p>
          <button
            className="button primary"
            disabled={!canRestore}
            onClick={restore}
          >
            <RotateCcw size={14} /> Load into editor
          </button>
        </footer>
      </section>
    </div>
  );
}
type HistoryState = ReturnType<typeof useRevisionHistory>;
function RevisionList({
  history,
  currentRevision,
}: {
  history: HistoryState;
  currentRevision?: string;
}) {
  return (
    <nav className="revision-list" aria-label="Saved versions">
      {history.versions.map((item) => (
        <button
          key={item.revision}
          aria-current={history.selected === item.revision ? "true" : undefined}
          onClick={() => history.setSelected(item.revision)}
        >
          <strong>
            Version {item.version}
            {item.revision === currentRevision && <small>Current</small>}
          </strong>
          <time dateTime={item.savedAt}>{savedDate(item.savedAt)}</time>
          <span>{item.title}</span>
          <span>{authorLabel(item.author)}</span>
        </button>
      ))}
      {history.loading && <p role="status">Loading saved versions…</p>}
      {history.listError && (
        <HistoryError message={history.listError} retry={history.retry} />
      )}
      {!history.loading && !history.listError && !history.versions.length && (
        <p>
          History begins with your next save. The current version will be kept
          too.
        </p>
      )}
      {history.more && (
        <button
          className="button"
          disabled={history.loading}
          onClick={history.loadMore}
        >
          Older versions
        </button>
      )}
    </nav>
  );
}
function RevisionDetail({ history }: { history: HistoryState }) {
  return (
    <div className="revision-detail">
      {history.detailError ? (
        <HistoryError message={history.detailError} retry={history.retry} />
      ) : history.version ? (
        <RevisionPreview
          key={history.selected}
          version={history.version}
          previous={history.previous}
        />
      ) : (
        <p role="status">
          {history.selected
            ? "Opening this version…"
            : "Choose a saved version to review."}
        </p>
      )}
    </div>
  );
}
function HistoryError({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      {message}
      <button className="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
function RevisionPreview({
  version,
  previous,
}: {
  version: PostRevision;
  previous: PostRevision | null;
}) {
  const [view, setView] = useState<"changes" | "preview" | "markdown">(
    "changes",
  );
  return (
    <>
      <div className="revision-preview-heading">
        <div>
          <span className="eyebrow">
            VERSION {version.version} · {version.status.toUpperCase()}
          </span>
          <h3>{version.title}</h3>
          <p>{savedDate(version.savedAt)}</p>
        </div>
        <p>{authorLabel(version.author)}</p>
        <div
          className="revision-view-tabs"
          role="group"
          aria-label="Revision view"
        >
          {(["changes", "preview", "markdown"] as const).map((item) => (
            <button
              key={item}
              className="button"
              aria-pressed={view === item}
              onClick={() => setView(item)}
            >
              {item === "changes"
                ? "Changes"
                : item === "preview"
                  ? "Preview"
                  : "Markdown"}
            </button>
          ))}
        </div>
      </div>
      <RevisionContent view={view} version={version} previous={previous} />
      <details className="revision-settings">
        <summary>Content settings in this version</summary>
        <dl>
          <dt>Content type</dt>
          <dd>{contentTypeLabel(version.contentType)}</dd>
          <dt>Slug</dt>
          <dd>{version.slug}</dd>
          <dt>Excerpt</dt>
          <dd>{version.excerpt || "—"}</dd>
          <dt>Tags</dt>
          <dd>{version.tags.join(", ") || "—"}</dd>
          <dt>Cover image</dt>
          <dd>{version.cover || "—"}</dd>
          <dt>Search title</dt>
          <dd>{version.seo.title || "—"}</dd>
          <dt>Search description</dt>
          <dd>{version.seo.description || "—"}</dd>
          <dt>Sharing image</dt>
          <dd>{version.seo.image || "—"}</dd>
          <dt>Recommendations</dt>
          <dd>{version.recommendations?.mode}</dd>
        </dl>
      </details>
    </>
  );
}
function RevisionContent({
  view,
  version,
  previous,
}: {
  view: "changes" | "preview" | "markdown";
  version: PostRevision;
  previous: PostRevision | null;
}) {
  if (view === "changes")
    return (
      <>
        <p className="diff-legend">
          {previous
            ? `Compared with version ${previous.version}`
            : "First recorded version"}
        </p>
        <PostDiff
          before={previous ?? emptyComparison(version)}
          after={version}
        />
      </>
    );
  if (view === "markdown")
    return <pre className="revision-source">{version.content}</pre>;
  return (
    <div className="revision-prose">
      <Markdown content={version.content} tableOfContents={version.tableOfContents} />
    </div>
  );
}
function savedDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
