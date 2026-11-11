import { useState } from "react";
import { StickyNote } from "lucide-react";
import type { Post } from "../../shared/types";
import type {
  ResearchContext,
  ResearchSource,
  WritingSession,
} from "../../shared/writing";
import { useResearchLibrary } from "./ResearchLibraryProvider";
import { savedResearchLabel } from "./ResearchReferences";
import { citeSource, selectResearchSource } from "./research";
import SourceCard from "./SourceCard";
import ResearchExcerpt from "./ResearchExcerpt";
import "./research.css";

type Props = {
  research?: ResearchContext;
  post: Post;
  session: WritingSession;
  onChange: (patch: Partial<WritingSession>) => void;
  insert: (before: string, after?: string) => void;
  selection: () => string;
  onManage: (view: "sources" | "notes") => void;
};
export default function ResearchActionCards(props: Props) {
  if (!props.research) return null;
  return <TurnResearch {...props} research={props.research} />;
}

function TurnResearch({
  research,
  post,
  session,
  onChange,
  insert,
  selection,
  onManage,
}: Props & { research: ResearchContext }) {
  const library = useResearchLibrary();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const { sources, savedURLs, changes } = cardSources(
    research,
    library.sources,
  );
  if (!sources.length && !changes) return null;
  async function run(action: () => Promise<void> | void, message: string) {
    setError("");
    setStatus("");
    setWorking(true);
    try {
      await action();
      setStatus(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <section
      className="research-references research-turn-cards"
      aria-label="Research results"
    >
      {changes && (
        <p className="research-turn-status">Saved to this draft: {changes}.</p>
      )}
      {!!sources.length && (
        <div className="research-turn-group">
          <div className="research-section-header">
            <h4>Research sources</h4>
            {session.research && (
              <button
                type="button"
                className="research-text-action"
                onClick={() => onManage("sources")}
              >
                Manage sources
              </button>
            )}
          </div>
          {sources.map((source) => (
            <SourceCard
              key={source.url}
              source={source}
              inConversation
              readOnly={!session.research}
              selected={session.researchSources.some(
                (s) => s.url === source.url,
              )}
              saved={savedURLs.has(source.url)}
              busy={session.busy || working}
              limitReached={session.researchSources.length >= 3}
              canSave={!!post.id}
              choose={(source, checked) =>
                selectResearchSource(session, source, checked, onChange)
              }
              save={() =>
                run(() => library.saveSource(source), "Source saved.")
              }
              cite={() =>
                void run(
                  () => citeSource(source, selection(), insert),
                  "Citation inserted into your draft.",
                )
              }
            />
          ))}
        </div>
      )}
      <TurnNoteCards
        research={research}
        openNotes={session.research ? () => onManage("notes") : undefined}
      />
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <p className="research-action-status" role="status">
        {status}
      </p>
    </section>
  );
}
function TurnNoteCards({
  research,
  openNotes,
}: {
  research: ResearchContext;
  openNotes?: () => void;
}) {
  if (!research.saved?.notes) return null;
  const noteItems = research.saved.noteItems ?? [];
  return (
    <div className="research-turn-group">
      <div className="research-section-header">
        <h4>Saved thinking notes</h4>
        {openNotes && (
          <button
            type="button"
            className="research-text-action"
            onClick={openNotes}
          >
            Open notes
          </button>
        )}
      </div>
      {noteItems.map((note) => (
        <article key={note.id} className="research-turn-note">
          <h5>
            <StickyNote size={14} aria-hidden="true" />
            {note.title}
          </h5>
          <ResearchExcerpt text={note.body} label="note" />
        </article>
      ))}
    </div>
  );
}

function cardSources(research: ResearchContext, library: ResearchSource[]) {
  const sources = new Map(research.sources.map((s) => [s.url, s]));
  const savedURLs = new Set(library.map((s) => s.url));
  for (const source of research.saved?.sourceItems ?? []) {
    savedURLs.add(source.url);
    sources.set(source.url, source);
  }
  return {
    sources: Array.from(sources.values()),
    savedURLs,
    changes: savedResearchLabel(research.saved),
  };
}
