import { useId, useState } from "react";
import {
  formattingCurrent,
  type FormattingProposal,
} from "../../shared/formatting";
import InnerTabs from "../components/InnerTabs";
import Markdown from "../Markdown";
import { TextDiff } from "../editor/PostDiff";

const views = [
  { value: "changes", label: "Changes" },
  { value: "original", label: "Original" },
  { value: "preview", label: "Preview" },
] as const;
type View = (typeof views)[number]["value"];
export default function FormattingPreview({
  proposal,
  content,
}: {
  proposal: FormattingProposal;
  content: string;
}) {
  const [view, setView] = useState<View>("changes");
  const id = useId();
  if (!proposal.changes)
    return <p role="status">No formatting changes were suggested.</p>;
  return (
    <section
      className="content-formatting-preview"
      aria-label="Formatting preview"
    >
      <h3>{proposal.applied ? "Applied formatting" : "Formatting preview"}</h3>
      <p role="status">
        {proposal.applied
          ? "Formatting applied to the editor."
          : `${proposal.changes} ${proposal.changes === 1 ? "change" : "changes"} ready to review.`}
      </p>
      {!formattingCurrent(content, proposal) && (
        <p className="notice">
          Your draft has changed. Ask again to format the latest version.
        </p>
      )}
      <InnerTabs
        label="Formatting preview views"
        tabs={views}
        value={view}
        onChange={setView}
        numbered={false}
        idPrefix={id}
        panelId={(item) => id + "-panel-" + item}
      />
      <div
        role="tabpanel"
        id={id + "-panel-" + view}
        aria-labelledby={id + "-" + view}
      >
        {view === "changes" ? (
          <TextDiff
            before={proposal.before}
            after={proposal.after}
            label="Formatting"
          />
        ) : view === "original" ? (
          <pre className="formatting-original">{proposal.before}</pre>
        ) : (
          <Markdown content={proposal.after} />
        )}
      </div>
    </section>
  );
}
