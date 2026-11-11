import PostConflict from "./PostConflict";
import RevisionHistory from "./RevisionHistory";
import CitationPicker from "../citations/CitationPicker";
import { X } from "lucide-react";
import AIPanel from "../AIPanel";
import BlockPicker from "../blocks/BlockPicker";
import TabsPicker from "../blocks/TabsPicker";
import MediaPicker from "../media/MediaPicker";
import PostDetails from "./PostDetails";
import SyntaxGuide from "./SyntaxGuide";
import type { AdminController } from "./useAdminController";
import "./dialog-layout.css";
type Props = {
  state: Pick<
    AdminController,
    | "conflicts"
    | "articleAudit"
    | "dirty"
    | "busy"
    | "posts"
    | "post"
    | "theme"
    | "modal"
    | "setModal"
    | "aiTab"
    | "notify"
    | "change"
    | "save"
    | "insert"
  >;
};
export default function AdminDialog({ state }: Props) {
  const { post, modal, setModal, save, insert, notify } = state;
  if (!modal) return null;
  if (modal === "conflict") return <ConflictDialog state={state} />;
  if (modal === "history")
    return (
      <RevisionHistory key={`${post.id}:${post.revision}`} state={state} />
    );
  const close = () => setModal(modal === "sharing-image" ? "seo-details" : null);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className={`modal ${dialogClass(modal)}`}
        role="dialog"
        aria-modal="true"
        aria-label={modal}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close icon-button"
          title="Close"
          onClick={close}
        >
          <X size={20} />
        </button>
        {modal === "citation" ? (
          <CitationPicker onInsert={insert} />
        ) : isStudio(modal) ? (
          <StudioDialog state={state} />
        ) : modal === "tabs" ? (
          <TabsPicker onInsert={insert} />
        ) : modal === "blocks" ? (
          <>
            <header className="dialog-header">
              <span className="eyebrow">
                TECHNICAL STORIES, MADE EXPLORABLE
              </span>
              <h2>Give your ideas another dimension.</h2>
            </header>
            <div className="dialog-body">
              <p className="muted">
                Insert a working example, edit its source, and explore it in the
                live preview.
              </p>
              <BlockPicker onInsert={insert} />
              <p className="block-author-note">
                Writing with an AI agent? Ask it to generate chart or scene JSON
                blocks, or Mermaid diagrams. Paste the Markdown here or save it
                with the CLI.
              </p>
            </div>
          </>
        ) : modal === "media" ? (
          <>
            <header className="dialog-header">
              <h2>Add media to your story.</h2>
              <p className="muted">Paste a hosted link, choose from your library, or upload a file.</p>
            </header>
            <MediaPicker onInsert={(s) => insert(s)} notify={notify} />
          </>
        ) : isPostDetails(modal) ? (
          <PostDetails key={modal} state={state} published={modal === "published-details"} startInSEO={modal !== "details"} />
        ) : (
          <SyntaxGuide />
        )}
      </section>
    </div>
  );
}

function ConflictDialog({ state }: Props) {
  const session = state.conflicts.session;
  return session ? (
    <PostConflict
      session={session}
      onApply={state.conflicts.apply}
      onClose={() => state.setModal(null)}
    />
  ) : null;
}

function isStudio(modal: string) {
  return modal === "ai" || modal === "sharing-image";
}

function StudioDialog({state}: Props) {
  const {modal, post, aiTab, change, setModal, notify, save, insert} = state;
  const sharing = modal === "sharing-image";
  function useImage(url: string) {
    if (sharing) {
      change({seo: {...post.seo, image: url}});
      setModal("seo-details");
      notify("Sharing image selected. Save or publish your changes to apply it.");
    } else {
      change({cover: url});
      setModal(null);
      notify("Cover selected. Save or publish your changes to apply it.");
    }
  }
  return <AIPanel initialTab={sharing ? "images" : aiTab} imagePurpose={sharing ? "sharing" : "cover"} post={post} onSave={() => save()} onInsert={insert} onUseImage={useImage} notify={notify} />;
}

function isPostDetails(modal: string) {
  return ["details", "published-details", "seo-details"].includes(modal);
}

function dialogClass(modal: string) {
  if (isPostDetails(modal)) return "post-details-modal";
  return isStudio(modal)
    ? "ai-modal"
    : modal === "tabs"
      ? "tabs-modal"
      : modal === "media"
        ? "media-modal"
        : "";
}
