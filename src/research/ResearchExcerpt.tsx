import { useId, useState } from "react";

export default function ResearchExcerpt({
  text,
  label,
}: {
  text: string;
  label: "abstract" | "context" | "note";
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const long = text.length > 180;
  return (
    <div className="research-excerpt">
      <p id={id}>
        {long && !expanded ? text.slice(0, 180).trimEnd() + "…" : text}
      </p>
      {long && (
        <button
          type="button"
          className="research-text-action"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Read less" : "Read full " + label}
        </button>
      )}
    </div>
  );
}
