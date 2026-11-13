import { useEffect, useRef, useState } from "react";
import LivePostNotice from "./LivePostNotice";
import DraftPanel from "../research/DraftPanel";
import { BookOpenCheck, BookOpenText } from "lucide-react";
import SimplifiedPanel from "./SimplifiedPanel";
import WritingPanel from "../ai/WritingPanel";
import EditorCard from "./EditorCard";
import EditorFooter from "./EditorFooter";
import EditorHeading from "./EditorHeading";
import PostTemplatePicker from "../editor/PostTemplatePicker";
import type { AdminController } from "./useAdminController";
export default function EditorPage({ state }: { state: AdminController }) {
  const { postError, route, post, setView } = state;
  if (postError || (route.postId || "") !== post.id)
    return (
      <section className="page-content" role={postError ? "alert" : "status"}>
        <p>{postError || "Opening content…"}</p>
        {postError && (
          <button className="button" onClick={() => setView("posts")}>
            Back to all content
          </button>
        )}
      </section>
    );
  if (state.role === "writer" && post.status === "archived") return <section className="page-content"><h1>{post.title}</h1><p>This article is archived. Ask a publisher or owner to restore it before editing.</p><button className="button" onClick={() => setView("posts")}>All content</button></section>;
  return <EditorWorkspace key={state.writing.key} state={state} />;
}

function EditorWorkspace({ state }: { state: AdminController }) {
  const [panel, setPanel] = useState<"Peer review" | "Simplified" | null>(null);
  const showPanel = (value: "Peer review" | "Simplified") => {
    state.writing.setOpen(false);
    setPanel(panel === value && !state.writing.open ? null : value);
  };
  const openPanel = state.writing.open ? null : panel;
  const focusOutline = useRef(false);
  useEffect(() => {
    if (
      !focusOutline.current ||
      state.mode === "preview" ||
      !state.editor.current
    )
      return;
    focusOutline.current = false;
    state.editor.current.focus();
    state.editor.current.setSelectionRange(0, 0);
  }, [state.post.content, state.mode, state.editor]);
  return (
    <>
      <EditorHeading state={state} />
      <div
        className={`editor-assistant-layout ${state.writing.open || panel === "Peer review" ? "with-assistant" : ""}`}
      >
        {openPanel && (
          <EditorSidePanel
            panel={openPanel}
            state={state}
            close={() => setPanel(null)}
          />
        )}
        {state.writing.open && (
          <WritingPanel state={state} />
        )}
        <div className="editor-composition">
          <LivePostNotice state={state} />
          <EditorCard
            state={state}
            templateAction={
              <>
                <button
                  aria-controls="draft-tools"
                  aria-expanded={openPanel === "Peer review"}
                  title="Peer review"
                  aria-label="Peer review"
                  onClick={() => showPanel("Peer review")}
                >
                  <BookOpenCheck size={16} />
                  <span className="editor-control-label">Peer review</span>
                </button>
                <button
                  title="Simplified version"
                  aria-label="Simplified version"
                  aria-haspopup="dialog"
                  aria-expanded={openPanel === "Simplified"}
                  onClick={() => showPanel("Simplified")}
                >
                  <BookOpenText size={16} />
                  <span className="editor-control-label">Simplified</span>
                </button>
                <PostTemplatePicker
                  post={state.post}
                  onChange={(patch) => {
                    focusOutline.current = true;
                    state.change(patch);
                    if (state.mode === "preview") state.setMode("write");
                    state.notify(
                      "Outline added. Replace the prompts with your writing, then save your draft.",
                    );
                  }}
                  busy={state.busy}
                />
              </>
            }
          />
          <EditorFooter state={state} />
        </div>
      </div>
    </>
  );
}

function EditorSidePanel({
  panel,
  state,
  close,
}: {
  panel: "Peer review" | "Simplified";
  state: AdminController;
  close: () => void;
}) {
  return panel === "Simplified" ? (
    <SimplifiedPanel post={state.post} close={close} />
  ) : (
    <DraftPanel state={state} close={close} />
  );
}
