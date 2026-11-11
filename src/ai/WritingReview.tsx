import { Quote, X } from "lucide-react";
import { editorialPrompts, type WritingSession } from "../../shared/writing";
import "./writing-insights.css";

const prompts = [
  ["audience", "Audience & clarity"],
  ["assumptions", "Assumptions"],
  ["argument", "Argument"],
  ["skeptic", "Skeptical reader"],
  ["evidence", "Evidence"],
] as const;
export default function WritingReview({
  session,
  onChange,
}: {
  session: WritingSession;
  onChange: (patch: Partial<WritingSession>) => void;
}) {
  return (
    <section
      className="assistant-passage-review"
      aria-label="Editorial feedback"
    >
      <h3>Review focus</h3>
      <div
        className="assistant-focus-options"
        role="group"
        aria-label="Review focus"
      >
        {prompts.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className="button"
            aria-pressed={session.brief === editorialPrompts[key]}
            disabled={session.busy}
            onClick={() =>
              onChange({
                mode: "questions",
                brief: editorialPrompts[key],
                refine: false,
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      {session.passage ? (
        <div className="assistant-passage">
          <header>
            <span>
              <Quote size={14} aria-hidden="true" />
              Selected passage
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label="Clear selection"
              title="Clear selection"
              disabled={session.busy}
              onClick={() => onChange({ passage: "" })}
            >
              <X size={14} />
            </button>
          </header>
          <blockquote>{session.passage}</blockquote>
          <small>Select the passage again after editing to refresh it.</small>
        </div>
      ) : (
        <small className="assistant-review-hint">
          To review a passage, select text in the editor, then choose Review.
        </small>
      )}
    </section>
  );
}
