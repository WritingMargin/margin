import type { PassageQuestion } from "../../shared/interactions";
import PassagePopover, { type PassageAnchor } from "./PassagePopover";
export default function PassageConversation({
  anchor,
  questions,
  quote,
  occurrence = 0,
  onClose,
}: {
  anchor: PassageAnchor;
  questions: PassageQuestion[];
  quote: string;
  occurrence?: number;
  onClose: () => void;
}) {
  return (
    <PassagePopover anchor={anchor} heading="In the margins" onClose={onClose}>
      <QuestionList questions={questions} quote={quote} occurrence={occurrence} />
    </PassagePopover>
  );
}
function QuestionList({
  questions,
  quote,
  occurrence,
}: {
  questions: PassageQuestion[];
  quote: string;
  occurrence: number;
}) {
  const visible = questions.filter((q) => !quote || q.quote === quote && (q.occurrence || 0) === occurrence);
  return (
    <>
      {visible.length === 0 && (
        <p>No questions yet. Select text to start a conversation.</p>
      )}
      {visible.map((q) => (
        <article className="passage-question" key={q.id}>
          <blockquote>{q.quote}</blockquote>
          {(q.section_anchor_status || q.anchor_status) !== "active" && (
            <p className="small-text">
              On an earlier version. This is the original quote.
            </p>
          )}
          <strong>{q.name}</strong>
          <p>{q.body}</p>
          {q.answer && (
            <div className="passage-answer">
              <strong>Author’s answer</strong>
              <p>{q.answer}</p>
            </div>
          )}
          {q.followups?.map((followup) => <div className="passage-thread-turn" key={followup.id}>
            <strong>{q.name}</strong><p>{followup.body}</p>
            {!followup.approved && <small>Awaiting approval</small>}
            {followup.answer && <div className="passage-answer"><strong>Author’s answer</strong><p>{followup.answer}</p></div>}
          </div>)}
        </article>
      ))}
    </>
  );
}
