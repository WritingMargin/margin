import { contentTypeLabel } from "../../shared/content-types";
import { Hash, Lightbulb, Plus } from "lucide-react";
import { useTeamIdentity } from "../auth/TeamContext";
import EditorActions from "./EditorActions";
import type { AdminController } from "./useAdminController";
type Props = {
  state: Pick<
    AdminController,
    "post" | "theme" | "modal" | "setModal" | "openAI" | "editor" | "change" | "words" | "writing"
  >;
};
export default function EditorHeading({ state }: Props) {
  const { role } = useTeamIdentity();
  const { post, setModal, words } = state;
  return (
    <section className="editor-heading editor-button-surface">
      <div className="editor-overline">
        <span>
          <i
            className={
              post.status === "published" ? "published-dot" : "draft-dot"
            }
          />
          {post.baseRevision && post.status === "draft" ? "Draft changes to published" : post.status} {contentTypeLabel(post.contentType, state.theme.publicationType)}
        </span>
      </div>
      <div className="editor-title-row">
        {/* The title is written as the first line of the pad; this mirrors it. */}
        <h1 className="title-input title-display">{post.title || "Untitled"}</h1>
        <div className="editor-title-actions">
          {role === "owner" && <button
            className="editor-writing-toggle"
            type="button"
            aria-label="Writing assistant"
            title="Writing assistant"
            aria-expanded={state.writing.open}
            aria-controls="writing-companion"
            onClick={() => state.writing.setOpen(!state.writing.open)}
          >
            <Lightbulb size={18} aria-hidden="true" />
          </button>}
          <EditorActions state={state} />
        </div>
      </div>
      <div className="editor-meta">
        <div className="tags">
          {post.tags.map((t) => (
            <span key={t}>
              <Hash size={11} />
              {t}
            </span>
          ))}
          <button aria-haspopup="dialog" aria-expanded={state.modal === "details"} onClick={() => setModal("details")}>
            <Plus size={13} />
            Add tag
          </button>
        </div>
        <span>
          {words} words <span className="meta-dot">·</span>{" "}
          {Math.max(1, Math.ceil(words / 200))} min read
        </span>
      </div>
    </section>
  );
}
