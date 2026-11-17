import NoteRevision from "./NoteRevision";
import type { ReviewNote } from "./types";

export default function ReviewNoteContent({ note, reviewPath }: { note: ReviewNote; reviewPath: string }) {
  return <>
    <blockquote>{note.quote}</blockquote>
    {note.anchorStatus === "earlier" && <small>On an earlier revision</small>}
    <p>{note.body}</p>
    {note.addressed_revision ? <NoteRevision note={note} reviewPath={reviewPath} /> : <small>Open</small>}
  </>;
}
