import { useRef, useState, type KeyboardEvent } from "react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection, type EditorState } from "@tiptap/pm/state";
import {
  Bold,
  Code2,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  Quote,
  Strikethrough,
  type LucideIcon,
} from "lucide-react";

type Tool = {
  label: string;
  icon: LucideIcon;
  active: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const tools: Tool[] = [
  { label: "Bold", icon: Bold, active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { label: "Italic", icon: Italic, active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { label: "Strikethrough", icon: Strikethrough, active: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  { label: "Inline code", icon: Code2, active: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run() },
  { label: "Heading", icon: Heading2, active: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: "Subheading", icon: Heading3, active: (e) => e.isActive("heading", { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { label: "Quote", icon: Quote, active: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { label: "List", icon: List, active: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
];

function showFor(editing: { current: boolean }) {
  return ({ editor, state }: { editor: Editor; state: EditorState }) => {
    if (editing.current) return true;
    const { selection } = state;
    if (selection.empty || selection instanceof NodeSelection) return false;
    return editor.isEditable && editor.view.hasFocus() && !editor.isActive("codeBlock");
  };
}

/** Formatting appears next to selected text, so the page itself stays clean. */
export default function SelectionBar({ editor }: { editor: Editor }) {
  const [linking, setLinkingState] = useState(false);
  const [href, setHref] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // The menu plugin keeps the first shouldShow it is given, so read from a ref.
  const linkingRef = useRef(false);
  const [shouldShow] = useState(() => showFor(linkingRef));
  const setLinking = (value: boolean) => {
    linkingRef.current = value;
    setLinkingState(value);
  };

  function startLink() {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    setHref("");
    setLinking(true);
    requestAnimationFrame(() => input.current?.focus());
  }

  function finishLink(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setLinking(false);
      editor.commands.focus();
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const url = href.trim();
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinking(false);
  }

  return (
    <BubbleMenu editor={editor} shouldShow={shouldShow} className="selection-bar">
      {linking ? (
        <input
          ref={input}
          className="selection-bar-link"
          aria-label="Link address"
          placeholder="Paste a link and press Enter"
          value={href}
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={finishLink}
          onBlur={() => setLinking(false)}
        />
      ) : (
        <>
          {tools.map((tool) => (
            <button
              key={tool.label}
              type="button"
              title={tool.label}
              aria-label={tool.label}
              aria-pressed={tool.active(editor)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => tool.run(editor)}
            >
              <tool.icon size={15} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            title={editor.isActive("link") ? "Remove link" : "Link"}
            aria-label={editor.isActive("link") ? "Remove link" : "Link"}
            aria-pressed={editor.isActive("link")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={startLink}
          >
            <Link size={15} aria-hidden="true" />
          </button>
        </>
      )}
    </BubbleMenu>
  );
}
