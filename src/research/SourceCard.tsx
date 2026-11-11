import { ArrowUpRight, BookmarkCheck, BookmarkPlus, Quote } from "lucide-react";
import type { ResearchSource } from "../../shared/writing";
import ResearchExcerpt from "./ResearchExcerpt";

type Props = {
  source: ResearchSource;
  selected: boolean;
  saved: boolean;
  busy: boolean;
  limitReached: boolean;
  canSave: boolean;
  readOnly?: boolean;
  inConversation?: boolean;
  choose: (source: ResearchSource, checked: boolean) => void;
  save?: () => Promise<void>;
  cite: () => void;
};

export default function SourceCard(props: Props) {
  const { source, saved, readOnly, inConversation } = props;
  return (
    <article className="research-source">
      <a
        className="research-source-title"
        href={source.url}
        target="_blank"
        rel="noreferrer"
      >
        <span>{source.title}</span>
        <ArrowUpRight size={13} aria-hidden="true" />
      </a>
      {inConversation && saved && (
        <span className="research-saved-label">
          <BookmarkCheck size={12} aria-hidden="true" /> Saved source
        </span>
      )}
      {source.excerpt && (
        <ResearchExcerpt text={source.excerpt} label="abstract" />
      )}
      {!readOnly && <SourceControls {...props} />}
    </article>
  );
}

function SourceControls({
  source,
  selected,
  saved,
  busy,
  limitReached,
  canSave,
  inConversation,
  choose,
  cite,
  save,
}: Props) {
  return (
    <div className="research-source-actions">
      <label>
        <input
          type="checkbox"
          aria-label={"Use " + source.title + " for AI research"}
          checked={selected}
          disabled={busy || (!selected && limitReached)}
          onChange={(e) => choose(source, e.target.checked)}
        />
        <span>Use for research</span>
      </label>
      {!saved && save && (
        <button
          type="button"
          className="research-text-action"
          disabled={busy || !canSave}
          onClick={() => void save()}
        >
          <BookmarkPlus size={13} aria-hidden="true" /> <span>Save source</span>
        </button>
      )}
      {(saved || inConversation) && (
        <button
          type="button"
          className="research-text-action"
          disabled={busy}
          onClick={cite}
        >
          <Quote size={13} aria-hidden="true" /> <span>Insert citation</span>
        </button>
      )}
    </div>
  );
}
