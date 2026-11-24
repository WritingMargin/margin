import { useTeamIdentity } from "../auth/TeamContext";
import { contentTypeLabel, themeForContentType } from "../../shared/content-types";
import { Code2, MessageSquareQuote, Plus, ScanText } from "lucide-react";
import MediaMenu from "../editor/MediaMenu";
import FormattingToolbar from "../editor/FormattingToolbar";
import WriterPad from "../editor/WriterPad";
import { useImageDrop } from "../editor/useImageDrop";
import ComponentShelf from "../editor/ComponentShelf";
import PadTitle from "../editor/PadTitle";
import { setCatalogActionHandler } from "../editor/rich/component-catalog";
import { slugify } from "./post-utils";
import EditorCover from "../editor/EditorCover";
import { blogThemeStyle } from "../blog/theme";
import type { AdminController } from "./useAdminController";
import { useMediaDefaults } from "../media/useMediaDefaults";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import "./editor-space.css";
import "../editor/headings.css";
import "../editor/rich/rich-writer.css";
type Props = {
  /** Kept for callers that still pass header actions; the top bar shows them now. */
  templateAction?: ReactNode;
  state: Pick<
    AdminController,
    | "view"
    | "post"
    | "theme"
    | "setView"
    | "setModal"
    | "modal"
    | "openAI"
    | "editor"
    | "change"
    | "insert"
    | "words"
    | "writing"
  >;
};

/**
 * The writer's pad: one slim formatting bar, then a plain page with the title,
 * subtitle, cover and body written in place. Components open from Insert.
 */
export default function EditorCard({ state }: Props) {
  const media = useMediaDefaults();
  const { role } = useTeamIdentity();
  const typeLabel = contentTypeLabel(state.post.contentType, state.theme.publicationType);
  const label = typeLabel.toLowerCase();
  const contentTheme = themeForContentType(state.theme, state.post.contentType);
  const { post, setModal, openAI, editor, change } = state;
  const [formatSlot, setFormatSlot] = useState<HTMLDivElement | null>(null);
  const [shelfOpen, setShelfOpen] = useState(false);
  const drop = useImageDrop({
    editorRef: editor,
    mediaDefaults: media.defaults,
    value: post.content || "",
    onChange: (content) => change({ content }),
  });
  useEffect(() => {
    setCatalogActionHandler((action) => editor.current?.insertDraftComponent?.(action));
    return () => setCatalogActionHandler(null);
  }, [editor]);
  function focusBody() {
    editor.current?.focus();
    editor.current?.setSelectionRange(0, 0);
  }
  function focusWriter(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as Element;
    if (target !== event.currentTarget && target.closest(".rich-writer-content, .pad-title, .pad-subtitle, .editor-cover, button, a, input, textarea, select")) return;
    const input = editor.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  }
  return (
    <section className="editor-card writer-pad-card">
      <FormattingToolbar>
        <div className="pad-format-slot" ref={setFormatSlot} />
        <span className="pad-divider" />
        <MediaMenu
          onMedia={() => editor.current?.insertDraftComponent?.("media")}
          onGenerate={() => openAI("images")}
        />
        <button type="button" title="Insert code block" aria-label="Insert code block" onMouseDown={event => event.preventDefault()} onClick={() => editor.current?.insertCodeBlock?.()}>
          <Code2 size={16} aria-hidden="true" /> Code block
        </button>
        <button
          title="Attach citation"
          aria-label="Attach citation"
          type="button"
          onMouseDown={event => event.preventDefault()}
          onClick={() => editor.current?.insertDraftComponent?.("citation")}
        >
          <MessageSquareQuote size={16} aria-hidden="true" /> Citation
        </button>
        {role === "owner" && <button disabled={state.writing.session.busy} title={`Review selected passage, or the full ${label}`} aria-label={`Review selection or ${label}`} onClick={() => {
          const input = editor.current;
          const passage = input?.value.slice(input.selectionStart, input.selectionEnd) || "";
          state.writing.review(passage);
        }}>
          <ScanText size={16} aria-hidden="true" /> Review
        </button>}
        <button
          className={`pad-insert-toggle${shelfOpen ? " is-open" : ""}`}
          title="Charts, polls, callouts, tabs and more"
          aria-label="Insert a component"
          aria-expanded={shelfOpen}
          aria-controls="component-shelf"
          onClick={() => setShelfOpen(!shelfOpen)}
        >
          <Plus size={16} aria-hidden="true" /> Insert
        </button>
      </FormattingToolbar>
      <div className="pad-row">
        {shelfOpen && <ComponentShelf editor={editor} onClose={() => setShelfOpen(false)} />}
        <div
          className="article-canvas publication-content"
          style={blogThemeStyle(contentTheme)}
          onClick={focusWriter}
          {...drop.handlers}
        >
          <div className="preview-article writer-page">
            <PadHeading
              post={post}
              typeLabel={typeLabel}
              showSubtitle={contentTheme.article.showExcerpt}
              change={change}
              onDone={focusBody}
            />
            <EditorCover cover={post.cover} mode={post.coverMode} showCover={contentTheme.article.showCover} onEdit={() => setModal("details")} />
            <WriterPad
              key={post.id}
              editorRef={editor}
              mediaDefaults={media.defaults}
              value={post.content || ""}
              onChange={(content) => change({ content })}
              toolbarSlot={formatSlot}
              drop={drop}
            />
          </div>
        </div>
      </div>
      <p className="pad-wordcount">
        {state.words} words · {Math.max(1, Math.ceil(state.words / 200))} min read
      </p>
    </section>
  );
}

type HeadingProps = {
  post: AdminController["post"];
  typeLabel: string;
  showSubtitle: boolean;
  change: AdminController["change"];
  onDone: () => void;
};

/** Title and subtitle, written as the first lines of the page (Enter moves down). */
function PadHeading({ post, typeLabel, showSubtitle, change, onDone }: HeadingProps) {
  const subtitle = useRef<HTMLTextAreaElement>(null);
  function setTitle(next: string) {
    const empty = !next.trim();
    const title = empty && !post.id ? "Untitled" : next;
    change({ title, ...(!post.id && !empty ? { slug: slugify(next) } : {}) });
  }
  return (
    <>
      <PadTitle
        className="pad-title"
        label={`${typeLabel} title`}
        placeholder="Title"
        value={!post.id && post.title === "Untitled" ? "" : post.title}
        onChange={setTitle}
        onNext={() => subtitle.current?.focus()}
      />
      <PadTitle
        className="pad-subtitle"
        fieldRef={subtitle}
        label={`${typeLabel} subtitle`}
        placeholder="Add a subtitle…"
        value={post.excerpt || ""}
        onChange={(excerpt) => change({ excerpt })}
        onNext={onDone}
      />
      {post.excerpt && !showSubtitle && (
        <p className="pad-subtitle-note">Hidden on the {typeLabel.toLowerCase()} by your design settings.</p>
      )}
    </>
  );
}
