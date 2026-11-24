import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Globe,
  LockKeyhole,
  Plus,
  Search,
  StickyNote,
  Users,
  X,
} from "lucide-react";
import {
  noteDisplayTitle,
  noteBody,
  noteSnippet,
  type WorkspaceNote,
} from "../../shared/notes";
import { date } from "../admin/post-utils";
import type { AdminController } from "../admin/useAdminController";
import InnerTabs, { type InnerTab } from "../components/InnerTabs";
import NoteEditor from "./NoteEditor";
import { useNotesStore } from "./useNotesStore";
import { filterNotes, noteCounts, resolveSelectedNote, type NoteFilter as Filter } from "./notes-view";
import "../admin/posts-pagination.css";
import "./notes.css";

type Props = {
  state: Pick<
    AdminController,
    "route" | "navigate" | "notify" | "confirmation" | "user"
  >;
};

export default function NotesPage({ state }: Props) {
  const store = useNotesStore(state.notify);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const currentAuthorId = state.user?.id || "local-owner";

  const visibleNotes = useMemo(
    () => filterNotes(store.notes, filter, query, currentAuthorId),
    [store.notes, filter, query, currentAuthorId],
  );
  const selected = resolveSelectedNote(visibleNotes, state.route.noteId);
  const counts = useMemo(
    () => noteCounts(store.notes, currentAuthorId),
    [store.notes, currentAuthorId],
  );

  function changeFilter(next: Filter) {
    setFilter(next);
    void state.navigate({ view: "notes" }, true);
  }

  async function handleCreate() {
    const created = await store.createNote();
    if (!created) return;
    setFilter("all");
    setQuery("");
    void state.navigate({ view: "notes", noteId: created.id });
  }

  async function handleDelete(note: WorkspaceNote) {
    const confirmed = await state.confirmation.ask({
      title: `Remove “${noteDisplayTitle(note)}”?`,
      description: "This note will be permanently deleted.",
      confirmLabel: "Remove note",
    });
    if (!confirmed) return;
    const removed = await store.removeNote(note.id);
    if (!removed) return;
    const next = visibleNotes.find((item) => item.id !== note.id);
    void state.navigate(next ? { view: "notes", noteId: next.id } : { view: "notes" }, true);
  }

  async function handleDuplicate(id: string) {
    const copy = await store.duplicateNote(id);
    if (!copy) return;
    setFilter("all");
    setQuery("");
    void state.navigate({ view: "notes", noteId: copy.id });
  }

  const tabs: readonly InnerTab<Filter>[] = [
    { value: "all", label: "All notes", count: counts.all },
    { value: "mine", label: "Private notes", shortLabel: "Private", count: counts.mine },
    { value: "team", label: "Public to team", shortLabel: "Team", count: counts.team },
  ];

  return (
    <section
      className={`page-content notes-page${state.route.noteId && selected?.id === state.route.noteId ? " has-selection" : ""}`}
      aria-label="Notes"
    >
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR NOTEBOOK</span>
          <h1>
            Notes
            <span className="heading-count">{store.notes.length}</span>
          </h1>
          <p>
            Keep a thought for later, save links and images, share with teammates, or attach notes to the Writing Assistant.
          </p>
        </div>
      </div>

      <InnerTabs
        label="Filter notes"
        numbered={false}
        tabs={tabs}
        value={filter}
        onChange={changeFilter}
      />

      <div className="notes-layout">
        <NotesListPanel
          visibleNotes={visibleNotes}
          selectedId={selected?.id ?? ""}
          currentAuthorId={currentAuthorId}
          filter={filter}
          query={query}
          loading={store.loading}
          error={store.error}
          creating={store.busyId === "new"}
          onCreate={() => void handleCreate()}
          onQueryChange={setQuery}
          onReload={() => void store.reload()}
          onSelect={(id) => void state.navigate({ view: "notes", noteId: id })}
        />
        <NotesMainStage
          selected={selected}
          emptyMessage={emptyListMessage(filter, query)}
          hasNotes={store.notes.length > 0}
          busyId={store.busyId}
          onBack={() => void state.navigate({ view: "notes" })}
          onSave={store.updateNote}
          onDelete={(note) => void handleDelete(note)}
          onShareLink={store.setShareLink}
          onDuplicate={(id) => void handleDuplicate(id)}
          onCreate={() => void handleCreate()}
          notify={state.notify}
        />
      </div>
    </section>
  );
}

function NotesListPanel({
  visibleNotes,
  selectedId,
  currentAuthorId,
  filter,
  query,
  loading,
  error,
  creating,
  onCreate,
  onQueryChange,
  onReload,
  onSelect,
}: {
  visibleNotes: WorkspaceNote[];
  selectedId: string;
  currentAuthorId: string;
  filter: Filter;
  query: string;
  loading: boolean;
  error: string;
  creating: boolean;
  onCreate: () => void;
  onQueryChange: (value: string) => void;
  onReload: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="notes-notebook-column" aria-label="Notes list">
      <button
        type="button"
        className="button primary notes-create"
        disabled={creating}
        onClick={onCreate}
      >
        <Plus size={15} aria-hidden="true" />
        <span>{creating ? "Creating…" : "New note"}</span>
      </button>

      <div className="notes-notebook-search">
        <div className="posts-list-search" role="search" aria-label="Search notes">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search notes"
            placeholder="Search saved notes…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear note search"
              onClick={() => onQueryChange("")}
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="notebook-list" aria-label="Saved notes">
        <NotesListBody
          visibleNotes={visibleNotes}
          selectedId={selectedId}
          currentAuthorId={currentAuthorId}
          filter={filter}
          query={query}
          loading={loading}
          error={error}
          onReload={onReload}
          onSelect={onSelect}
        />
      </div>
    </aside>
  );
}

function NotesMainStage({
  selected,
  emptyMessage,
  hasNotes,
  busyId,
  onBack,
  onSave,
  onDelete,
  onShareLink,
  onDuplicate,
  onCreate,
  notify,
}: {
  selected: WorkspaceNote | null;
  emptyMessage: string;
  hasNotes: boolean;
  busyId: string | null;
  onBack: () => void;
  onSave: ReturnType<typeof useNotesStore>["updateNote"];
  onDelete: (note: WorkspaceNote) => void;
  onShareLink: ReturnType<typeof useNotesStore>["setShareLink"];
  onDuplicate: (id: string) => void;
  onCreate: () => void;
  notify: (message: string) => void;
}) {
  if (!selected) {
    return (
      <div className="notes-empty-card">
        <div className="notebook-empty">
          <span className="notebook-empty-icon">
            <StickyNote size={27} strokeWidth={1.4} aria-hidden="true" />
          </span>
          <h3>{hasNotes ? "No notes in this view" : "No notes yet"}</h3>
          <p>{emptyMessage}</p>
          <button type="button" className="button primary" onClick={onCreate}>
            {hasNotes ? "Take a note" : "Take your first note"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="notes-editor-column">
      <button type="button" className="notebook-back notes-mobile-back" onClick={onBack}>
        <ArrowLeft size={15} aria-hidden="true" />
        All notes
      </button>
      <NoteEditor
        key={selected.id}
        note={selected}
        busy={busyId === selected.id}
        onSave={onSave}
        onDelete={onDelete}
        onShareLink={onShareLink}
        onDuplicate={onDuplicate}
        notify={notify}
      />
    </div>
  );
}

function NotesListBody({
  visibleNotes,
  selectedId,
  currentAuthorId,
  filter,
  query,
  loading,
  error,
  onReload,
  onSelect,
}: {
  visibleNotes: WorkspaceNote[];
  selectedId: string;
  currentAuthorId: string;
  filter: Filter;
  query: string;
  loading: boolean;
  error: string;
  onReload: () => void;
  onSelect: (id: string) => void;
}) {
  if (loading) return <p className="notebook-loading" role="status">Loading notes…</p>;
  if (error) {
    return (
      <div className="error-box" role="alert">
        {error}
        <button type="button" className="button" onClick={onReload}>
          Try again
        </button>
      </div>
    );
  }
  if (visibleNotes.length === 0) {
    return <p className="notebook-loading">{emptyListMessage(filter, query)}</p>;
  }
  return (
    <>
      {visibleNotes.map((item) => (
        <NoteListItem
          key={item.id}
          note={item}
          active={selectedId === item.id}
          mine={item.authorId === currentAuthorId}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </>
  );
}

function emptyListMessage(filter: Filter, query: string) {
  if (query) return `No notes match “${query}”.`;
  if (filter === "team") return "No notes are shared with your team yet.";
  if (filter === "mine") return "You have no private notes yet.";
  return "No notes yet. Click “New note” to start.";
}

function NoteListItem({
  note,
  active,
  mine,
  onSelect,
}: {
  note: WorkspaceNote;
  active: boolean;
  mine: boolean;
  onSelect: () => void;
}) {
  const snippet = noteSnippet(noteBody(note));
  return (
    <button
      type="button"
      className={`notebook-card note-list-card${active ? " is-active" : ""}`}
      onClick={onSelect}
    >
      <div className="note-card-title-row">
        <strong className="note-card-title">{noteDisplayTitle(note)}</strong>
        <span className="note-list-badges">
          {note.shared && <Globe size={12} aria-label="External share link active" />}
          {note.isPublic ? (
            <Users size={12} aria-label="Public to team" />
          ) : (
            <LockKeyhole size={12} aria-label="Private to you" />
          )}
        </span>
      </div>
      {snippet && <span className="notebook-card-body">{snippet}</span>}
      <span className="note-list-meta">
        <span>{date(note.updatedAt)}</span>
        {!mine && note.authorName && <span>· {note.authorName}</span>}
      </span>
    </button>
  );
}
