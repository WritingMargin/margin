import { useEffect, useReducer, useRef, useState, type KeyboardEvent } from "react";
import type { Editor } from "@tiptap/react";
import Select from "../../components/Select";
import { codeLanguages } from "../../../shared/code-languages";
import {
  Bold,
  Code2,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  type LucideIcon,
} from "lucide-react";

type Tool = {
  label: string;
  icon: LucideIcon;
  active?: (editor: Editor) => boolean;
  enabled?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const marks: Tool[] = [
  { label: "Bold", icon: Bold, active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { label: "Italic", icon: Italic, active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: "Strikethrough", icon: Strikethrough, active: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  { label: "Inline code", icon: Code2, active: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run() },
];

const blocks: Tool[] = [
  { label: "Quote", icon: Quote, active: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: "Bulleted list", icon: List, active: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: "Numbered list", icon: ListOrdered, active: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
];

const history: Tool[] = [
  { label: "Undo", icon: Undo2, enabled: (e) => e.can().undo(), run: (e) => e.chain().focus().undo().run() },
  { label: "Redo", icon: Redo2, enabled: (e) => e.can().redo(), run: (e) => e.chain().focus().redo().run() },
];

const styles = [
  { value: "p", label: "Normal text" },
  { value: "2", label: "Heading" },
  { value: "3", label: "Subheading" },
  { value: "4", label: "Small heading" },
] as const;

function currentStyle(editor: Editor) {
  for (const level of [2, 3, 4] as const) if (editor.isActive("heading", { level })) return String(level);
  return editor.isActive("heading") ? "" : "p";
}

function applyStyle(editor: Editor, value: string) {
  if (value === "p") editor.chain().focus().setParagraph().run();
  else editor.chain().focus().setHeading({ level: Number(value) as 2 | 3 | 4 }).run();
}

function ToolButton({ editor, tool }: { editor: Editor; tool: Tool }) {
  return (
    <button
      type="button"
      className="pad-tool"
      title={tool.label}
      aria-label={tool.label}
      aria-pressed={tool.active ? tool.active(editor) : undefined}
      disabled={tool.enabled ? !tool.enabled(editor) : false}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => tool.run(editor)}
    >
      <tool.icon size={16} aria-hidden="true" />
    </button>
  );
}

function LinkTool({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const active = editor.isActive("link");

  function toggle() {
    if (active) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    setHref("");
    setOpen(true);
    requestAnimationFrame(() => input.current?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") setOpen(false);
    if (event.key !== "Enter") return;
    event.preventDefault();
    const url = href.trim();
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setOpen(false);
  }

  return (
    <span className="pad-link-tool">
      <button
        type="button"
        className="pad-tool"
        title={active ? "Remove link" : "Link (select text first)"}
        aria-label={active ? "Remove link" : "Link"}
        aria-pressed={active}
        disabled={!active && editor.state.selection.empty}
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        <Link size={16} aria-hidden="true" />
      </button>
      {open && (
        <input
          ref={input}
          className="pad-link-input"
          aria-label="Link address"
          placeholder="Paste a link and press Enter"
          value={href}
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        />
      )}
    </span>
  );
}

/**
 * Substack-style formatting: a text style menu, marks, link, quote and lists,
 * undo/redo. It works on the rich document directly and reflects the caret.
 */
export default function RichToolbar({ editor }: { editor: Editor }) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    editor.on("transaction", refresh);
    return () => {
      editor.off("transaction", refresh);
    };
  }, [editor]);

  return (
    <div className="pad-format" role="group" aria-label="Text formatting">
      {editor.isActive("codeBlock") ? <Select
        className="pad-style pad-code-language"
        aria-label="Code language"
        value={editor.getAttributes("codeBlock").language || ""}
        onChange={event => editor.chain().focus().updateAttributes("codeBlock", { language: event.target.value || null }).run()}
      >
        <option value="">Detect automatically</option>
        {codeLanguages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select> : (<select
        className="pad-style"
        aria-label="Text style"
        value={currentStyle(editor)}
        onChange={(event) => applyStyle(editor, event.target.value)}
      >
        {styles.map((style) => (
          <option key={style.value} value={style.value}>
            {style.label}
          </option>
        ))}
      </select>)}
      <span className="pad-divider" />
      {marks.map((tool) => <ToolButton key={tool.label} editor={editor} tool={tool} />)}
      <LinkTool editor={editor} />
      <span className="pad-divider" />
      {blocks.map((tool) => <ToolButton key={tool.label} editor={editor} tool={tool} />)}
      <span className="pad-divider" />
      {history.map((tool) => <ToolButton key={tool.label} editor={editor} tool={tool} />)}
    </div>
  );
}
