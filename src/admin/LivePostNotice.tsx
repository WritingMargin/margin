import type { AdminController } from "./useAdminController";
import "./live-post.css";
export default function LivePostNotice({ state }: { state: AdminController }) {
  if (!state.post.id) return null;
  const { pending, deleted, connection } = state.livePost;
  if (deleted)
    return (
      <aside className="live-post-notice" role="status">
        This post was deleted elsewhere. Your editor content is still here; copy
        it before leaving.
      </aside>
    );
  if (pending)
    return (
      <aside className="live-post-notice" role="status">
        <span>
          {state.dirty
            ? "A newer version was saved elsewhere. Your unsaved edits are preserved."
            : "A newer version is ready. Close the open dialog to update this preview."}
        </span>
        {state.dirty && (
          <button
            type="button"
            className="button"
            disabled={state.busy}
            onClick={state.conflicts.review}
          >
            Review changes
          </button>
        )}
      </aside>
    );
  if (connection === "unauthorized")
    return (
      <aside className="live-post-notice" role="status">
        Live updates paused. Sign in again to reconnect. Your editor content is
        preserved.
      </aside>
    );
  if (connection === "reconnecting")
    return (
      <aside className="live-post-notice" role="status">
        Reconnecting live updates… You can keep editing.
      </aside>
    );
  return null;
}
