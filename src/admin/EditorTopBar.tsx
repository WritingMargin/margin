import type { ReactNode } from "react";
import { CircleHelp, Lightbulb, Paintbrush } from "lucide-react";
import { useTeamIdentity } from "../auth/TeamContext";
import { contentTypeLabel } from "../../shared/content-types";
import EditorActions from "./EditorActions";
import { SaveButtons, SaveStatus } from "./EditorFooter";
import type { AdminController } from "./useAdminController";

type Props = {
  state: AdminController;
  /** Page-level tools such as Peer review, Simplified, and Templates. */
  actions?: ReactNode;
};

/**
 * One slim bar above the pad. Left: where the draft stands ("Draft post ·
 * Saved"). Right: writing tools and options, then Save draft and Publish.
 */
export default function EditorTopBar({ state, actions }: Props) {
  const { role } = useTeamIdentity();
  const { post } = state;
  const typeLabel = contentTypeLabel(post.contentType, state.theme.publicationType);
  const status = post.baseRevision && post.status === "draft" ? "Draft changes to published" : post.status;
  return (
    <header className="pad-topbar editor-button-surface">
      <div className="pad-topbar-status">
        <i className={post.status === "published" ? "published-dot" : "draft-dot"} aria-hidden="true" />
        <span className="pad-topbar-kind">{status} {typeLabel.toLowerCase()}</span>
        <span className="pad-topbar-sep" aria-hidden="true">·</span>
        <SaveStatus state={state} />
      </div>
      <div className="pad-topbar-actions">
        <div className="pad-topbar-tools">
          {role === "owner" && (
            <button
              className="editor-writing-toggle"
              type="button"
              aria-label="Writing assistant"
              title="Writing assistant"
              aria-expanded={state.writing.open}
              aria-controls="writing-companion"
              onClick={() => state.writing.setOpen(!state.writing.open)}
            >
              <Lightbulb size={17} aria-hidden="true" />
            </button>
          )}
          {actions}
          <EditorActions
            state={state}
            more={[
              { label: "Customize theme", icon: Paintbrush, run: () => state.setView("designer") },
              { label: "Markdown guide", icon: CircleHelp, run: () => state.setModal("help") },
            ]}
          />
        </div>
        <SaveButtons state={state} />
      </div>
    </header>
  );
}
