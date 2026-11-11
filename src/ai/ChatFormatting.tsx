import { Check, Undo2 } from "lucide-react";
import {
  formattingCurrent,
  type FormattingProposal,
} from "../../shared/formatting";
import FormattingPreview from "./FormattingPreview";
import "./content-formatting.css";

export default function ChatFormatting({
  proposal,
  content,
  busy,
  update,
  askAgain,
}: {
  proposal: FormattingProposal;
  content: string;
  busy: boolean;
  update: (action: "apply" | "undo") => void;
  askAgain: () => void;
}) {
  const current = formattingCurrent(content, proposal);
  return (
    <div className="chat-formatting">
      <FormattingPreview proposal={proposal} content={content} />
      <div className="chat-formatting-actions">
        <button
          type="button"
          className="button primary"
          disabled={busy || !current}
          onClick={() => update(proposal.applied ? "undo" : "apply")}
        >
          {proposal.applied ? (
            <Undo2 size={13} aria-hidden="true" />
          ) : (
            <Check size={13} aria-hidden="true" />
          )}
          {proposal.applied ? "Undo formatting" : "Apply formatting"}
        </button>
        {!current && (
          <button
            type="button"
            className="chat-copy"
            disabled={busy}
            onClick={askAgain}
          >
            Ask again
          </button>
        )}
      </div>
    </div>
  );
}
