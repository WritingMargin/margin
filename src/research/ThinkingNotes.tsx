import type { SavedWritingNote } from "../../shared/writing";
import ResearchExcerpt from "./ResearchExcerpt";

export default function ThinkingNotes({
  notes,
}: {
  notes: SavedWritingNote[];
}) {
  return (
    <section>
      <p className="research-muted">
        Ask in chat to save a thought, question, or next step with this draft.
      </p>
      {!!notes.length && (
        <div className="research-note-list">
          <h3>Saved notes</h3>
          {notes.map((item) => (
            <SavedResearchNote key={item.id} item={item} />
          ))}
        </div>
      )}
      {!notes.length && (
        <p className="research-muted research-note-list">No saved notes yet.</p>
      )}
    </section>
  );
}
function SavedResearchNote({ item }: { item: SavedWritingNote }) {
  const { note, createdAt } = item;
  return (
    <article className="research-note">
      {note.title !== "Thinking note" && <h4>{note.title}</h4>}
      <p>{note.body}</p>
      {note.reason && <p>{note.reason}</p>}
      {note.brief && (
        <div className="research-note-context">
          <span>Research context</span>
          <ResearchExcerpt text={note.brief} label="context" />
        </div>
      )}
      <time dateTime={createdAt}>
        {new Date(createdAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </time>
    </article>
  );
}
