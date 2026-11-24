import { useRef, useState } from "react";
import {
  ImagePlus,
  Link2,
  LockKeyhole,
  Users,
} from "lucide-react";
import { formatNoteForCopy, noteDisplayTitle, type WorkspaceNote } from "../../shared/notes";
import { initialMediaDefaults } from "../../shared/media-defaults";
import type { WriterEditor } from "../editor/editor-handle";
import { useImageDrop } from "../editor/useImageDrop";
import WriterPad from "../editor/WriterPad";
import PadTitle from "../editor/PadTitle";
import Markdown from "../Markdown";
import { date } from "../admin/post-utils";
import NoteLinkDialog from "./NoteLinkDialog";
import NoteActions, { type NoteActionsProps } from "./NoteActions";
import { type NotePatch } from "./useNotesStore";
import { useNoteDraft } from "./useNoteDraft";
import "../editor/rich/rich-writer.css";

type Props = {
  note: WorkspaceNote;
  busy: boolean;
  onSave: (id: string, patch: NotePatch) => Promise<WorkspaceNote | null>;
  onDelete: (note: WorkspaceNote) => void;
  onShareLink: (id: string, enabled: boolean, regenerate?: boolean) => Promise<WorkspaceNote | null>;
  onDuplicate: (id: string) => void;
  notify: (message: string) => void;
};

export default function NoteEditor({
  note,
  busy,
  onSave,
  onDelete,
  onShareLink,
  onDuplicate,
  notify,
}: Props) {
  const { title, setTitle, content, setContent, saving, dirty, flush } = useNoteDraft(note, onSave);
  const [linkOpen, setLinkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [formatSlot, setFormatSlot] = useState<HTMLDivElement | null>(null);
  const editorRef = useRef<WriterEditor | null>(null);

  const drop = useImageDrop({
    editorRef,
    value: content,
    onChange: setContent,
    mediaDefaults: initialMediaDefaults,
    imagesOnly: true,
  });

  async function copyNote() {
    try {
      await navigator.clipboard.writeText(formatNoteForCopy({ title, content, links: [] }));
      setCopied(true);
      notify("Note copied to clipboard.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      notify("Clipboard access is unavailable.");
    }
  }

  function toggleVisibility(nextPublic: boolean) {
    void onSave(note.id, { title, content, links: [], isPublic: nextPublic }).then((saved) => {
      if (saved) {
        notify(saved.isPublic ? "Note is now public to teammates." : "Note is now private.");
      }
    });
  }

  async function afterSave(action: () => void) {
    if (await flush()) action();
  }

  return (
    <div
      className="editor-card writer-pad-card note-editor-card"
      {...(note.canEdit ? drop.handlers : {})}
    >
      <NoteEditorTopbar
        note={{ ...note, title, content, links: [] }}
        saving={saving}
        dirty={dirty}
        busy={busy}
        copied={copied}
        onToggleVisibility={toggleVisibility}
        onCopy={() => void copyNote()}
        onDuplicate={() => void afterSave(() => onDuplicate(note.id))}
        onShareLink={(enabled, regenerate) => void afterSave(() => void onShareLink(note.id, enabled, regenerate))}
        onDelete={() => void afterSave(() => onDelete(note))}
        notify={notify}
      />
      {note.canEdit && (
        <NoteEditorToolbar
          setFormatSlot={setFormatSlot}
          onUploadFiles={drop.uploadFiles}
          onInsertLink={() => setLinkOpen(true)}
        />
      )}
      <div className={`note-editor-canvas${drop.dragging ? " is-drop-active" : ""}`}>
        <div className="note-editor-page">
          <NoteEditorBody
            note={note}
            title={title}
            content={content}
            onTitleChange={setTitle}
            onContentChange={setContent}
            editorRef={editorRef}
            formatSlot={formatSlot}
            drop={drop}
          />
        </div>
      </div>
      {linkOpen && <NoteLinkDialog
        onClose={() => setLinkOpen(false)}
        onInsert={(url, label) => {
          editorRef.current?.insertLink?.(url, label);
          setLinkOpen(false);
        }}
      />}
    </div>
  );
}

function saveStatusLabel(note: WorkspaceNote, saving: boolean, dirty: boolean) {
  if (!note.canEdit) return `Shared by ${note.authorName || "Teammate"} · ${date(note.updatedAt)}`;
  if (saving) return "Saving…";
  if (dirty) return "Unsaved changes";
  return `Saved · ${date(note.updatedAt)}`;
}

function NoteEditorTopbar({ saving, dirty, ...actions }: NoteActionsProps & {
  saving: boolean;
  dirty: boolean;
}) {
  const { note } = actions;
  return (
    <header className="editor-controls note-editor-topbar editor-button-surface">
      <div className="note-editor-status">
        <span className="notebook-privacy-inline">
          {note.isPublic ? <Users size={13} aria-hidden="true" /> : <LockKeyhole size={13} aria-hidden="true" />}
          <span>{note.isPublic ? "Public to team" : "Private to you"}</span>
        </span>
        <span className="note-save-sep" aria-hidden="true">·</span>
        <span className="note-save-state" role="status">
          {saveStatusLabel(note, saving, dirty)}
        </span>
      </div>
      <NoteActions {...actions} />
    </header>
  );
}

function NoteEditorToolbar({
  setFormatSlot,
  onUploadFiles,
  onInsertLink,
}: {
  setFormatSlot: (el: HTMLDivElement | null) => void;
  onUploadFiles: (files: File[]) => void;
  onInsertLink: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="note-toolbar" role="group" aria-label="Note tools">
      <div className="pad-format-slot" ref={setFormatSlot} />
      <span className="pad-divider" aria-hidden="true" />
      <button type="button" className="pad-tool" title="Add link" aria-label="Add link"
        onMouseDown={(event) => event.preventDefault()} onClick={onInsertLink}>
        <Link2 size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="pad-tool"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        title="Add image"
        aria-label="Add image"
      >
        <ImagePlus size={16} aria-hidden="true" />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          if (files.length) onUploadFiles(files);
        }}
      />
    </div>
  );
}

function NoteEditorBody({
  note,
  title,
  content,
  onTitleChange,
  onContentChange,
  editorRef,
  formatSlot,
  drop,
}: {
  note: WorkspaceNote;
  title: string;
  content: string;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  editorRef: React.RefObject<WriterEditor | null>;
  formatSlot: HTMLDivElement | null;
  drop: ReturnType<typeof useImageDrop>;
}) {
  if (!note.canEdit) {
    return (
      <>
        <h2 className="pad-title note-title-readonly">{noteDisplayTitle(note)}</h2>
        <div className="note-readonly-body">
          <Markdown content={content || "_This note has no text yet._"} />
        </div>
      </>
    );
  }
  return (
    <>
      <PadTitle
        className="pad-title note-pad-title"
        label="Note title"
        placeholder="Note title"
        value={title}
        onChange={(value) => onTitleChange(value.slice(0, 200))}
        onNext={() => {
          editorRef.current?.focus();
          editorRef.current?.setSelectionRange(0, 0);
        }}
      />
      <div className="note-pad-body">
        <WriterPad
          minimal
          key={note.id}
          editorRef={editorRef}
          value={content}
          onChange={onContentChange}
          mediaDefaults={initialMediaDefaults}
          imagesOnly
          ariaLabel="Note content"
          placeholder="Write your note, paste links, or drag and drop images here…"
          toolbarSlot={formatSlot}
          drop={drop}
        />
      </div>
    </>
  );
}
