import { Fragment, useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { SavedWritingNote, WritingNote } from "../../shared/writing";
export default function KeptInsight({ saved }: { saved: SavedWritingNote }) {
  const { note } = saved;
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  return (
    <article className="assistant-kept-insight">
      <h4>{note.title}</h4>
      <p>{note.body}</p>
      {note.reason && (
        <div className="assistant-reason">
          <strong>My reasoning</strong>
          <p>{note.reason}</p>
        </div>
      )}
      <div className="assistant-insight-meta">
        <time dateTime={saved.createdAt}>
          {new Date(saved.createdAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>
        {hasContext(note) && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide context" : "View context"}
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>
      {expanded && <InsightContext id={panelId} note={note} />}
    </article>
  );
}
function hasContext(note: WritingNote) {
  return Boolean(
    note.brief ||
    note.feedback ||
    note.audience ||
    note.passage ||
    note.includedDraft,
  );
}

function InsightContext({ id, note }: { id: string; note: WritingNote }) {
  const fields = [
    ["Brief", note.brief],
    ["Follow-up", note.feedback],
    ["Audience", note.audience],
    ["Passage", note.passage],
    [
      "Draft context",
      note.includedDraft
        ? "The draft and its unsaved edits were included."
        : "",
    ],
  ] as const;
  return (
    <dl id={id} className="assistant-note-context">
      {fields.map(
        ([label, value]) =>
          value && (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ),
      )}
    </dl>
  );
}
