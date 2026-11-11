import { useEffect, useId, useRef } from "react";
import type { WritingSession } from "../../shared/writing";
import { useResearchLibrary } from "./ResearchLibraryProvider";
import type { Post } from "../../shared/types";
import InnerTabs from "../components/InnerTabs";
import NotebookPicker from "./NotebookPicker";
import ResearchSources from "./ResearchSources";
import ThinkingNotes from "./ThinkingNotes";
import "./research.css";

const tabs = [
  { value: "sources", label: "Sources" },
  { value: "notes", label: "Notes" },
  { value: "notebook", label: "Notebook" },
] as const;

export default function ResearchPanel({
  post,
  insert,
  selection,
  session,
  onChange,
  visible,
}: {
  session: WritingSession;
  onChange: (patch: Partial<WritingSession>) => void;
  visible: boolean;
  post: Post;
  insert: (before: string, after?: string) => void;
  selection: () => string;
}) {
  const view = session.researchView ?? "sources";
  const { sources, notes, error, refresh } = useResearchLibrary();
  const prefix = useId();
  const workspace = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!visible) return;
    refresh();
    workspace.current
      ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
      ?.focus();
  }, [visible, refresh]);
  return (
    <div className="research-workspace" ref={workspace}>
      <InnerTabs
        label="Research tools"
        idPrefix={prefix}
        panelId={(value) => prefix + "-panel-" + value}
        tabs={tabs}
        numbered={false}
        value={view}
        onChange={(researchView) => onChange({ researchView })}
      />
      {error && (
        <div role="alert" className="error-box">
          {error}{" "}
          <button className="button" onClick={refresh}>
            Retry
          </button>
        </div>
      )}
      <section
        role="tabpanel"
        hidden={view !== "sources"}
        id={prefix + "-panel-sources"}
        aria-labelledby={prefix + "-sources"}
      >
        <ResearchSources
          postID={post.id}
          session={session}
          onChange={onChange}
          sources={sources}
          insert={insert}
          selection={selection}
        />
      </section>
      <section
        role="tabpanel"
        hidden={view !== "notes"}
        id={prefix + "-panel-notes"}
        aria-labelledby={prefix + "-notes"}
      >
        {post.id ? (
          <ThinkingNotes notes={notes} />
        ) : (
          <p>Save a draft to keep thinking notes with it.</p>
        )}
      </section>
      <section
        role="tabpanel"
        hidden={view !== "notebook"}
        id={prefix + "-panel-notebook"}
        aria-labelledby={prefix + "-notebook"}
      >
        <NotebookPicker insert={insert} />
      </section>
    </div>
  );
}
