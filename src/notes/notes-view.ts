import type { WorkspaceNote } from "../../shared/notes";

export type NoteFilter = "all" | "mine" | "team";

function matchesFilter(note: WorkspaceNote, filter: NoteFilter, authorId: string) {
  if (filter === "mine") return note.authorId === authorId && !note.isPublic;
  if (filter === "team") return note.isPublic;
  return true;
}

export function filterNotes(notes: WorkspaceNote[], filter: NoteFilter, query: string, authorId: string) {
  const needle = query.trim().toLowerCase();
  return notes.filter((note) => {
    if (!matchesFilter(note, filter, authorId)) return false;
    const text = [note.title, note.content, note.authorName,
      ...note.links.flatMap((link) => [link.title || "", link.url])].join(" ");
    return text.toLowerCase().includes(needle);
  });
}

export function noteCounts(notes: WorkspaceNote[], authorId: string) {
  return {
    all: notes.length,
    mine: notes.filter((note) => matchesFilter(note, "mine", authorId)).length,
    team: notes.filter((note) => note.isPublic).length,
  };
}

export function resolveSelectedNote(visibleNotes: WorkspaceNote[], id?: string) {
  return visibleNotes.find((note) => note.id === id) || visibleNotes[0] || null;
}
