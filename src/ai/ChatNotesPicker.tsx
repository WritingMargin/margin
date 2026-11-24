import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, Search, StickyNote, Users } from "lucide-react";
import { noteDisplayTitle, noteSnippet, type WorkspaceNote } from "../../shared/notes";
import type { AttachedNoteRef, WritingSession } from "../../shared/writing";
import { api } from "../api";

const MAX_ATTACHED_NOTES = 10;

export default function ChatNotesPicker({
  session,
  change,
}: {
  session: WritingSession;
  change: (patch: Partial<WritingSession>) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { notes, loading, error } = useAvailableNotes(open);
  const attached = session.attachedNotes ?? [];

  usePopoverPosition(open, trigger, bubble);

  function toggleNote(note: WorkspaceNote) {
    const exists = attached.some((item) => item.id === note.id);
    if (exists) {
      change({ attachedNotes: attached.filter((item) => item.id !== note.id) });
      return;
    }
    if (attached.length >= MAX_ATTACHED_NOTES) return;
    const ref: AttachedNoteRef = { id: note.id, title: noteDisplayTitle(note) };
    change({ attachedNotes: [...attached, ref] });
  }

  return (
    <>
      <button
        type="button"
        ref={trigger}
        className={`chat-context-trigger chat-notes-trigger${attached.length ? " has-notes" : ""}`}
        aria-label={attached.length ? `Attach notes (${attached.length} attached)` : "Attach notes"}
        title="Attach notes as context"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        disabled={session.busy}
        popoverTarget={id}
      >
        <StickyNote size={13} aria-hidden="true" />
        <span>{attached.length ? `Notes (${attached.length})` : "Notes"}</span>
      </button>
      <div
        id={id}
        ref={bubble}
        className="chat-context-fields chat-notes-popover"
        role="dialog"
        aria-labelledby={`${id}-heading`}
        popover="auto"
        onBeforeToggle={(event) => {
          if (event.newState === "open" && trigger.current) {
            positionPopover(trigger.current, event.currentTarget);
          }
        }}
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <header className="chat-context-heading chat-notes-popover-head">
          <h3 id={`${id}-heading`}>Attach notes</h3>
          {attached.length > 0 && (
            <button
              type="button"
              className="chat-notes-clear"
              onClick={() => change({ attachedNotes: [] })}
            >
              Clear
            </button>
          )}
        </header>
        <div className="chat-notes-search">
          <Search size={12} aria-hidden="true" />
          <input
            type="text"
            aria-label="Filter notes to attach"
            form=""
            placeholder="Search notes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <NotesPickerList
          notes={notes}
          filtered={filterNotes(notes, query)}
          attached={attached}
          loading={loading}
          error={error}
          onToggle={toggleNote}
        />
      </div>
    </>
  );
}

function NotesPickerList({
  notes,
  filtered,
  attached,
  loading,
  error,
  onToggle,
}: {
  notes: WorkspaceNote[];
  filtered: WorkspaceNote[];
  attached: AttachedNoteRef[];
  loading: boolean;
  error: string;
  onToggle: (note: WorkspaceNote) => void;
}) {
  if (loading) return <p className="chat-notes-state" role="status">Loading notes…</p>;
  if (error) return <p className="chat-notes-state is-error" role="alert">{error}</p>;
  if (filtered.length === 0) {
    return (
      <p className="chat-notes-state">
        {notes.length
          ? "No notes match that search."
          : "No notes yet. Create notes in the Notes tab to attach them here."}
      </p>
    );
  }
  return (
    <div className="chat-notes-list">
      {filtered.map((note) => {
        const selected = attached.some((item) => item.id === note.id);
        const disabled = !selected && attached.length >= MAX_ATTACHED_NOTES;
        const snippet = noteSnippet(note.content);
        return (
          <button
            key={note.id}
            type="button"
            className={`chat-notes-item${selected ? " is-selected" : ""}`}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onToggle(note)}
          >
            <span className="chat-notes-item-copy">
              <strong>
                {noteDisplayTitle(note)}
                {note.isPublic && <Users size={11} aria-label="Team note" />}
              </strong>
              {snippet && <small>{snippet}</small>}
            </span>
            <Check className="chat-notes-check" size={13} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function useAvailableNotes(open: boolean) {
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    api<WorkspaceNote[]>("/notes")
      .then((items) => {
        if (active) setNotes(items);
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);
  return { notes, loading, error };
}

function usePopoverPosition(
  open: boolean,
  trigger: React.RefObject<HTMLButtonElement | null>,
  bubble: React.RefObject<HTMLDivElement | null>,
) {
  useLayoutEffect(() => {
    const button = trigger.current;
    const popover = bubble.current;
    if (!open || !button || !popover) return;
    const position = () => positionPopover(button, popover);
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open, trigger, bubble]);
}

function filterNotes(notes: WorkspaceNote[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return notes;
  return notes.filter((note) =>
    `${note.title} ${note.content}`.toLowerCase().includes(needle),
  );
}

function positionPopover(button: HTMLElement, popover: HTMLElement) {
  const panel = button.closest(".writing-assistant")?.getBoundingClientRect();
  const target = button.getBoundingClientRect();
  const inset = 8;
  const leftBound = panel ? Math.max(panel.left, 0) + inset : inset;
  const rightBound = panel
    ? Math.min(panel.right, document.documentElement.clientWidth) - inset
    : document.documentElement.clientWidth - inset;
  const width = Math.min(290, rightBound - leftBound);
  const bottom = target.top - 4;
  popover.style.width = width + "px";
  popover.style.left =
    Math.max(leftBound, Math.min(target.left, rightBound - width)) + "px";
  popover.style.maxHeight = Math.max(120, bottom - inset) + "px";
  popover.style.top = bottom + "px";
}
