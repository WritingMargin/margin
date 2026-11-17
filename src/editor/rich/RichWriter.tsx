import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { WriterEditor } from "../editor-handle";
import type { RefObject } from "react";
import { importMarginMarkdownWithSources, MARGIN_COMPONENT } from "./markdown";
import { serializeDoc, offsetToPos, posToOffset, rememberSources } from "./serialize";
import { MarginComponent, MarkdownShortcuts } from "./extensions";
import { richEditorBridge } from "./editor-bridge";
import { setComponentEditHandler } from "./component-edit";
import ComponentSettings from "./ComponentSettings";
import { BlockHandle } from "./block-handle";
import SelectionBar from "./SelectionBar";
import SlashMenu, { useSlashMenu } from "./SlashMenu";
import RichToolbar from "./RichToolbar";

type Props = {
  editorRef: RefObject<WriterEditor | null>;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  /** Where the host page wants the formatting toolbar rendered. */
  toolbarSlot?: HTMLElement | null;
};

type Settings = { pos: number; src: string; label: string; kind: string } | null;

const extensions = [
  StarterKit.configure({ dropcursor: { color: "var(--accent, #40543b)", width: 2 } }),
  MarginComponent,
  MarkdownShortcuts,
  BlockHandle,
  Placeholder.configure({
    placeholder: ({ editor }) =>
      editor.isEmpty
        ? "Start writing, or press / to add a component…"
        : "Type / to add a component",
  }),
];

export default function RichWriter({
  editorRef,
  value,
  onChange,
  ariaLabel = "Article content",
  toolbarSlot,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const applyingExternal = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [settings, setSettings] = useState<Settings>(null);
  // Parse once for the initial document; later changes go through setContent.
  const [initial] = useState(() => importMarginMarkdownWithSources(value));
  const slashKeys = useRef<(event: KeyboardEvent) => boolean>(() => false);

  const editor = useEditor(
    {
      extensions,
      content: initial.doc,
      immediatelyRender: false,
      onCreate: ({ editor }) => {
        rememberSources(editor.state.doc, initial);
        // Adding the caret line is not an author edit: don't emit a change.
        applyingExternal.current = true;
        try {
          ensureTrailingParagraph(editor);
        } finally {
          applyingExternal.current = false;
        }
      },
      editorProps: {
        attributes: {
          class: "rich-writer-content",
          role: "textbox",
          "aria-label": ariaLabel,
          "aria-multiline": "true",
          spellcheck: "false",
        },
        handleKeyDown: (_view, event) => slashKeys.current(event),
      },
      onUpdate: ({ editor }) => {
        if (applyingExternal.current) return;
        const markdown = serializeDoc(editor.state.doc).markdown;
        if (markdown === lastEmitted.current) return;
        lastEmitted.current = markdown;
        onChangeRef.current(markdown);
      },
    },
    [],
  );

  // Controlled external updates (templates, revisions, AI, offset insertion).
  useLayoutEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    applyingExternal.current = true;
    try {
      const imported = importMarginMarkdownWithSources(value);
      editor.commands.setContent(imported.doc, { emitUpdate: false });
      rememberSources(editor.state.doc, imported);
      ensureTrailingParagraph(editor);
    } finally {
      applyingExternal.current = false;
    }
    lastEmitted.current = value;
  }, [value, editor]);

  // Expose the legacy WriterEditor contract (offset-based selection, value).
  useEffect(() => {
    if (!editor) {
      editorRef.current = null;
      return;
    }
    editorRef.current = richEditorBridge(editor, () => scrollRef.current);
    attachDomBridge(editor);
    return () => {
      editorRef.current = null;
    };
  }, [editor, editorRef]);

  const slash = useSlashMenu(editor, scrollRef);
  slashKeys.current = slash.onKeyDown;

  // Hand off component edit requests from NodeViews to the settings dialog.
  useEffect(() => {
    if (!editor) return;
    setComponentEditHandler(({ pos }) => {
      const node = editor.state.doc.nodeAt(pos);
      if (!node || node.type.name !== MARGIN_COMPONENT) return;
      setSettings({
        pos,
        src: node.attrs.src,
        label: node.attrs.label,
        kind: node.attrs.kind,
      });
    });
    return () => setComponentEditHandler(null);
  }, [editor]);

  function applySettings(src: string) {
    if (!settings || !editor) return;
    const node = editor.state.doc.nodeAt(settings.pos);
    if (node && node.type.name === MARGIN_COMPONENT) {
      const tr = editor.state.tr.setNodeMarkup(settings.pos, undefined, {
        src,
        label: node.attrs.label,
        kind: node.attrs.kind,
      });
      editor.view.dispatch(tr);
    }
  }

  function closeSettings() {
    setSettings(null);
    requestAnimationFrame(() => editor?.commands.focus());
  }

  return (
    <>
      <div className="rich-writer-scroll" ref={scrollRef}>
        {!editor && (
          <textarea
            readOnly
            aria-label={ariaLabel}
            value={value}
            className="rich-writer-fallback"
          />
        )}
        <EditorContent editor={editor} />
        {editor && <SelectionBar editor={editor} />}
        {slash.menu && <SlashMenu menu={slash.menu} pick={slash.pick} />}
      </div>
      {editor && toolbarSlot && createPortal(<RichToolbar editor={editor} />, toolbarSlot)}
      {settings && (
        <ComponentSettings
          src={settings.src}
          label={settings.label}
          kind={settings.kind}
          onChange={applySettings}
          onClose={closeSettings}
        />
      )}
    </>
  );
}

/** A component-only document still needs an empty line to put the caret in. */
function ensureTrailingParagraph(editor: Editor) {
  const last = editor.state.doc.lastChild;
  if (last?.isTextblock) return;
  const paragraph = editor.schema.nodes.paragraph;
  if (!paragraph) return;
  editor.view.dispatch(
    editor.state.tr.insert(editor.state.doc.content.size, paragraph.create()),
  );
}

/** Minimal DOM contract for browser tooling that reads `.value`/selection. */
function attachDomBridge(editor: Editor) {
  const dom = editor.view.dom as HTMLElement & {
    value?: string;
    selectionStart?: number;
    selectionEnd?: number;
    setSelectionRange?: (start: number, end: number) => void;
  };
  const snapshot = () => serializeDoc(editor.state.doc);
  Object.defineProperties(dom, {
    value: {
      configurable: true,
      get: () => snapshot().markdown,
    },
    selectionStart: {
      configurable: true,
      get: () => {
        const { segments } = snapshot();
        return posToOffset(segments, editor.state.selection.from);
      },
    },
    selectionEnd: {
      configurable: true,
      get: () => {
        const { segments } = snapshot();
        return posToOffset(segments, editor.state.selection.to);
      },
    },
  });
  dom.setSelectionRange = (start, end) => {
    const { segments, markdown } = snapshot();
    start = Math.max(0, Math.min(start, markdown.length));
    end = Math.max(start, Math.min(end, markdown.length));
    editor.commands.setTextSelection({
      from: offsetToPos(segments, start),
      to: offsetToPos(segments, end),
    });
  };
}
