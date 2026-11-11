import { contentTypeLabel, themeForContentType } from "../../shared/content-types";
import CodeBlockPicker from "../editor/CodeBlockPicker";
import {
  Bold,
  BookOpen,
  Boxes,
  ChevronDown,
  CircleHelp,
  MessageSquareQuote,
  Code2,
  Columns2,
  Italic,
  Link,
  List,
  Paintbrush,
  Quote,
  ScanText,
} from "lucide-react";
import MediaMenu from "../editor/MediaMenu";
import HeadingPicker from "../editor/HeadingPicker";
import FormattingToolbar from "../editor/FormattingToolbar";
import WriterPad from "../editor/WriterPad";
import EditorCover from "../editor/EditorCover";
import Markdown from "../Markdown";
import { blogThemeStyle } from "../blog/theme";
import type { AdminController } from "./useAdminController";
import { useMediaDefaults } from "../media/useMediaDefaults";
import type { ReactNode } from "react";
import "./editor-space.css";
type Props = {
  templateAction?: ReactNode;
  state: Pick<
    AdminController,
    | "view"
    | "post"
    | "theme"
    | "mode"
    | "setMode"
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
export default function EditorCard({ state, templateAction }: Props) {
  const media = useMediaDefaults();
  const label = contentTypeLabel(state.post.contentType, state.theme.publicationType).toLowerCase();
  const contentTheme = themeForContentType(state.theme, state.post.contentType);
  const {
    post,
    mode,
    setMode,
    setView,
    setModal,
    openAI,
    editor,
    change,
    insert,
  } = state;
  return (
    <section className="editor-card">
      <div className="editor-controls editor-button-surface">
        <div className="mode-tabs" role="group" aria-label="Editor view">
          <button
            className={mode === "write" ? "active" : ""}
            aria-label="Write"
            title="Write"
            aria-pressed={mode === "write"}
            onClick={() => setMode("write")}
          >
            <Code2 size={14} />
            <span>Write</span>
          </button>
          <button
            className={mode === "split" ? "active" : ""}
            aria-label="Split view"
            title="Split view"
            aria-pressed={mode === "split"}
            onClick={() => setMode("split")}
          >
            <Columns2 size={14} />
            <span>Split view</span>
          </button>
          <button
            className={mode === "preview" ? "active" : ""}
            aria-label="Preview"
            title="Preview"
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            <BookOpen size={14} />
            <span>Preview</span>
          </button>
        </div>
        <div className="editor-control-right">
          {templateAction}
          <button title="Markdown guide" aria-label="Markdown guide" aria-haspopup="dialog" aria-expanded={state.modal === "help"} onClick={() => setModal("help")}>
            <CircleHelp size={16} aria-hidden="true" />
            <span className="editor-control-label">Guide</span>
          </button>
        </div>
      </div>
      <div className={`editor-panes ${mode}`}>
        <div className="source-pane">
          <FormattingToolbar>
            <HeadingPicker
              editor={editor}
              content={post.content || ""}
              onChange={(content) => change({ content })}
            />
            {[
              { icon: Bold, title: "Bold", before: "**", after: "**" },
              {
                icon: Italic,
                title: "Italic",
                before: "_",
                after: "_",
              },
              { icon: Quote, title: "Quote", before: "\n> " },
              { icon: List, title: "List", before: "\n- " },
              {
                icon: Link,
                title: "Link",
                before: "[",
                after: "](https://example.com)",
              },
              { icon: Code2, title: "Inline code", before: "`", after: "`" },
            ].map((f) => (
              <button
                key={f.title}
                title={f.title}
                aria-label={f.title}
                onClick={() => insert(f.before, f.after)}
              >
                <f.icon size={16} aria-hidden="true" />
                <span>{f.title}</span>
              </button>
            ))}
            <CodeBlockPicker editor={editor} content={post.content || ""} onChange={content => change({content})} />
            <span />
            <button
              title="Attach citation"
              aria-label="Attach citation"
              aria-haspopup="dialog"
              aria-expanded={state.modal === "citation"}
              onClick={() => setModal("citation")}
            >
              <MessageSquareQuote size={16} aria-hidden="true" /> Citation
            </button>
            <MediaMenu
              onMedia={() => setModal("media")}
              onGenerate={() => openAI("images")}
            />
            <button disabled={state.writing.session.busy} title={`Review selected passage, or the full ${label}`} aria-label={`Review selection or ${label}`} onClick={() => {
              const input = editor.current;
              const passage = input?.value.slice(input.selectionStart, input.selectionEnd) || "";
              state.writing.review(passage);
            }}>
              <ScanText size={16} aria-hidden="true" /> Review
            </button>
            <button
              title="Insert tabs"
              aria-label="Insert tabs"
              aria-haspopup="dialog"
              aria-expanded={state.modal === "tabs"}
              onClick={() => setModal("tabs")}
            >
              <Columns2 size={16} aria-hidden="true" /> Tabs
            </button>
            <button
              title="Insert interactive block"
              aria-label="Insert interactive block"
              aria-haspopup="dialog"
              aria-expanded={state.modal === "blocks"}
              onClick={() => setModal("blocks")}
            >
              <Boxes size={16} aria-hidden="true" /> Interactive
            </button>
            <button className="markdown-label" aria-haspopup="dialog" aria-expanded={state.modal === "help"} onClick={() => setModal("help")}>
              Markdown <ChevronDown size={12} />
            </button>
          </FormattingToolbar>
          <EditorCover cover={post.cover} mode={post.coverMode} showCover={contentTheme.article.showCover} onEdit={() => setModal("details")} />
          <WriterPad
            key={post.id}
            editorRef={editor}
            mediaDefaults={media.defaults}
            value={post.content || ""}
            onChange={(content) => change({ content })}
          />
        </div>
        <div className="preview-pane">
          <div className="preview-label editor-button-surface">
            <span className="editor-live-status"><span className="live-dot" aria-hidden="true" />Live preview</span>
            <button onClick={() => setView("designer")} title="Customize your blog theme">
              <Paintbrush size={13} aria-hidden="true" /> Customize
            </button>
          </div>
          <div className="preview-content publication-content" style={blogThemeStyle(contentTheme)}>
            <div className="preview-article">
              <h1 className="preview-post-title">{post.title}</h1>
              <EditorCover cover={post.cover} mode={post.coverMode} showCover={contentTheme.article.showCover} />
              <Markdown
                content={post.content || "*Your words will appear here.*"}
                tableOfContents={post.tableOfContents}
                contentsDesign={contentTheme.article.tableOfContents}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
