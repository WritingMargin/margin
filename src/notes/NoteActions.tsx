import { useState } from "react";
import { Check, Copy, CopyPlus, LockKeyhole, Share2, Trash2, Users } from "lucide-react";
import type { WorkspaceNote } from "../../shared/notes";
import EditorOptionsMenu, { type EditorMenuItem } from "../editor/EditorOptionsMenu";
import NoteSharePopover from "./NoteSharePopover";

export type NoteActionsProps = {
  note: WorkspaceNote;
  busy: boolean;
  copied: boolean;
  onToggleVisibility: (isPublic: boolean) => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onShareLink: (enabled: boolean, regenerate?: boolean) => void;
  onDelete: () => void;
  notify: (message: string) => void;
};

export default function NoteActions(props: NoteActionsProps) {
  const { note, busy, copied, onToggleVisibility, onCopy, onDuplicate, onDelete } = props;
  const [sharing, setSharing] = useState(false);
  const items: EditorMenuItem[] = [];
  if (note.canEdit) items.push({
    label: note.isPublic ? "Make private" : "Share with teammates",
    icon: note.isPublic ? LockKeyhole : Users,
    disabled: busy,
    run: () => onToggleVisibility(!note.isPublic),
  });
  items.push(
    { label: copied ? "Note copied" : "Copy note", icon: copied ? Check : Copy, run: onCopy },
    { label: "Duplicate note", icon: CopyPlus, run: onDuplicate, disabled: busy },
    { label: "Share note", icon: Share2, run: () => setSharing(true) },
  );
  if (note.canDelete) items.push({ label: "Remove note", icon: Trash2, run: onDelete, disabled: busy, danger: true });
  return <div className="note-options">
    <EditorOptionsMenu label="Note options" items={items} />
    {sharing && <NoteSharePopover note={note} busy={busy} onTogglePublic={onToggleVisibility}
      onShareLink={props.onShareLink} notify={props.notify} onClose={() => setSharing(false)} />}
  </div>;
}
