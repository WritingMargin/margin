import { contentTypeLabel } from "../../shared/content-types";
import { Hash, Plus } from "lucide-react";
import { slugify } from "../admin/post-utils";
import EditorActions from "./EditorActions";
import type { AdminController } from "./useAdminController";
type Props = {
  state: Pick<
    AdminController,
    "post" | "theme" | "modal" | "setModal" | "openAI" | "editor" | "change" | "words" | "writing"
  >;
};
export default function EditorHeading({ state }: Props) {
  const { post, setModal, change, words } = state;
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
        <input
          aria-label={`${contentTypeLabel(post.contentType, state.theme.publicationType)} title`}
          className="title-input"
          value={post.title}
          onChange={(e) =>
            change({
              title: e.target.value,
              ...(!post.id ? { slug: slugify(e.target.value) } : {}),
            })
          }
        />
        <EditorActions state={state} />
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
