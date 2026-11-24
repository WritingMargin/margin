import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { WriterEditor } from "../editor-handle";
import type { RefObject } from "react";
import { extractDroppedFiles, extractPastedImages, isFileTransfer } from "../image-drop";
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
import { NoteShortcuts } from "./note-shortcuts";
import { FormattingShortcuts } from "./formatting-shortcuts";

type Props = {
  editorRef: RefObject<WriterEditor | null>;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  placeholder?: string;
  /** Where the host page wants the formatting toolbar rendered. */
  toolbarSlot?: HTMLElement | null;
  onDropFiles?: (files: File[]) => void;
  minimal?: boolean;
};

type Settings = { pos: number; src: string; label: string; kind: string } | null;

function buildExtensions(placeholder?: string, minimal = false) {
  return [
    StarterKit.configure({ dropcursor: { color: "var(--accent, #40543b)", width: 2 } }),
    FormattingShortcuts,
    MarginComponent,
    ...(minimal ? [NoteShortcuts] : [MarkdownShortcuts, BlockHandle]),
    Placeholder.configure({
      placeholder: ({ editor }) =>
        editor.isEmpty
          ? (placeholder || "Start writing, or press / to add a component…")
          : (minimal ? "" : "Type / to add a component"),
    }),
  ];
}

export default function RichWriter({
  editorRef,
  value,
  onChange,
  ariaLabel = "Article content",
  placeholder,
  toolbarSlot,
  onDropFiles,
  minimal = false,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const applyingExternal = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDropFilesRef = useRef(onDropFiles);
  onDropFilesRef.current = onDropFiles;
  const [settings, setSettings] = useState<Settings>(null);
  // Parse once for the initial document; later changes go through setContent.
  const [initial] = useState(() => importMarginMarkdownWithSources(value));
  const slashKeys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const extensions = useMemo(() => buildExtensions(placeholder, minimal), [placeholder, minimal]);

  const editor = useEditor(
    {
      extensions,
      content: initial.doc,
      immediatelyRender: false,
      enableInputRules: minimal ? ["bold", "italic"] : true,
      enablePasteRules: minimal ? ["bold", "italic", "link"] : true,
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
        handleDrop: (view, event) => {
          const files = extractDroppedFiles(event.dataTransfer);
          if (!files.length || !onDropFilesRef.current) return false;
          event.preventDefault();
          event.stopPropagation();
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (coords) {
            const $pos = view.state.doc.resolve(coords.pos);
            view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
          }
          onDropFilesRef.current(files);
          return true;
        },
        handlePaste: (_view, event) => {
          const files = extractPastedImages(event.clipboardData);
          if (!files.length || !onDropFilesRef.current) return false;
          event.preventDefault();
          onDropFilesRef.current(files);
          return true;
        },
        handleDOMEvents: {
          dragover: (_view, event) => {
            if (isFileTransfer(event.dataTransfer) && onDropFilesRef.current) {
              event.preventDefault();
            }
            return false;
          },
        },
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

  const slash = useSlashMenu(minimal ? null : editor, scrollRef);
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
        {editor && <WriterFormatting editor={editor} toolbarSlot={toolbarSlot} minimal={minimal} />}
        {slash.menu && <SlashMenu menu={slash.menu} pick={slash.pick} />}
      </div>
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

function WriterFormatting({ editor, toolbarSlot, minimal }: {
  editor: Editor;
} & Pick<Props, "toolbarSlot" | "minimal">) {
  return <>
    {!minimal && <SelectionBar editor={editor} />}
    {toolbarSlot && createPortal(<RichToolbar editor={editor} minimal={minimal} />, toolbarSlot)}
  </>;
}

/** A component-only document still needs an empty line to put the caret in.
 *  Adding it is bookkeeping, not an author edit: keep it out of undo history. */
function ensureTrailingParagraph(editor: Editor) {
  const last = editor.state.doc.lastChild;
  if (last?.isTextblock) return;
  const paragraph = editor.schema.nodes.paragraph;
  if (!paragraph) return;
  editor.view.dispatch(
    editor.state.tr
      .insert(editor.state.doc.content.size, paragraph.create())
      .setMeta("addToHistory", false),
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
