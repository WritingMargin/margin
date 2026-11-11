import { useState } from "react";
import type { ResearchSource, WritingSession } from "../../shared/writing";
import { citeSource, selectResearchSource } from "./research";
import SourceCard from "./SourceCard";
import { X } from "lucide-react";

type Props = {
  postID: string;
  session: WritingSession;
  sources: ResearchSource[];
  onChange: (patch: Partial<WritingSession>) => void;
  insert: (before: string, after?: string) => void;
  selection: () => string;
};
export default function ResearchSources({
  postID,
  session,
  sources,
  onChange,
  insert,
  selection,
}: Props) {
  const [status, setStatus] = useState(""),
    [error, setError] = useState("");
  function cite(source: ResearchSource) {
    setError("");
    setStatus("");
    try {
      citeSource(source, selection(), insert);
      setStatus("Citation inserted into your draft.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const selectedURLs = new Set(session.researchSources.map((s) => s.url));
  const choose = (source: ResearchSource, checked: boolean) =>
    selectResearchSource(session, source, checked, onChange);
  function card(source: ResearchSource) {
    return (
      <SourceCard
        key={source.url}
        source={source}
        saved
        selected={selectedURLs.has(source.url)}
        busy={session.busy}
        limitReached={selectedURLs.size >= 3}
        canSave={!!postID}
        choose={choose}
        cite={() => cite(source)}
      />
    );
  }
  return (
    <>
      <p className="research-muted">
        Ask in chat to find papers or save a source URL. Saved sources appear
        here.
      </p>
      {!!session.researchSources.length && (
        <div className="research-selection">
          <h4>
            Selected for research{" "}
            <span>{session.researchSources.length} of 3</span>
          </h4>
          <ul>
            {session.researchSources.map((source) => (
              <li key={source.url}>
                <span>{source.title}</span>
                <button
                  type="button"
                  className="icon-button"
                  disabled={session.busy}
                  aria-label={"Remove " + source.title + " from research"}
                  title="Remove source from research"
                  onClick={() => choose(source, false)}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {postID && (
        <section className="research-library">
          <h3>Saved sources</h3>
          {sources.map(card)}
          {!sources.length && (
            <p className="research-muted">No saved sources yet.</p>
          )}
        </section>
      )}
      {!postID && <p>Save your draft to keep sources with it.</p>}
      {!!error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <p className="research-action-status" role="status">
        {status}
      </p>
    </>
  );
}
