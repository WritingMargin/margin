import { BookmarkPlus, Check, Copy, CornerDownRight } from "lucide-react";
import { copyWritingSection, type WritingPlan } from "../../shared/writing";
import ReplyMarkdown from "./ReplyMarkdown";
import "./writing-insights.css";

type Actions = {
  keep: (title: string, body: string) => void;
  refine?: (note: string) => void;
  busy?: boolean;
};
type Props = Actions & {
  plan: WritingPlan;
  copied: string;
  copy: (value: string, id: string) => void;
};
export function WritingResults({
  plan,
  copied,
  copy,
  keep,
  refine,
  busy,
}: Props) {
  return (
    <div className="assistant-suggestions">
      {plan.sections.map((section, index) => (
        <section
          className="assistant-suggestion-group"
          key={section.heading + index}
        >
          <header>
            <h4>{section.heading}</h4>
            <button
              type="button"
              className="icon-button"
              title={"Copy " + section.heading}
              aria-label={"Copy " + section.heading}
              onClick={() => copy(copyWritingSection(section), String(index))}
            >
              {copied === String(index) ? (
                <Check size={15} />
              ) : (
                <Copy size={15} />
              )}
            </button>
          </header>
          {section.quote && (
            <blockquote className="assistant-draft-quote">{section.quote}</blockquote>
          )}
          <ul>
            {section.notes.map((note, i) => (
              <Suggestion
                key={i}
                title={section.heading}
                body={note}
                quote={section.quote}
                keep={keep}
                refine={refine}
                busy={busy}
              />
            ))}
          </ul>
        </section>
      ))}
      {plan.questions.length > 0 && (
        <section className="assistant-suggestion-group">
          <header>
            <h4>Questions to explore</h4>
          </header>
          <ul>
            {plan.questions.map((question, i) => (
              <Suggestion
                key={i}
                title="Question to revisit"
                body={question}
                keep={keep}
                refine={refine}
                busy={busy}
                question
              />
            ))}
          </ul>
        </section>
      )}
      <span className="sr-only" role="status">
        {copied ? "Notes copied to clipboard." : ""}
      </span>
    </div>
  );
}
function Suggestion({
  title,
  body,
  quote,
  keep,
  refine,
  busy,
  question = false,
}: Actions & { title: string; body: string; quote?: string; question?: boolean }) {
  const contextualBody = quote ? `“${quote}”\n\n${body}` : body;
  return (
    <li>
      <ReplyMarkdown content={body} compact />
      <div className="assistant-note-actions">
        <button type="button" onClick={() => keep(title, contextualBody)}>
          <BookmarkPlus size={13} aria-hidden="true" />
          Keep insight
        </button>
        {refine && (
          <button type="button" disabled={busy} onClick={() => refine(contextualBody)}>
            <CornerDownRight size={13} aria-hidden="true" />
            {question ? "Explore question" : "Refine suggestion"}
          </button>
        )}
      </div>
    </li>
  );
}
