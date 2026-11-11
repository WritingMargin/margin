import type { ResearchContext } from "../../shared/writing";

export function ResearchReferences({
  research,
  onManage,
}: {
  research?: ResearchContext;
  onManage?: () => void;
}) {
  const { sources, changes, canManage } = referenceSummary(research);
  if (!sources.length && !changes) return null;
  return (
    <section className="research-references">
      {changes && <p role="status">Saved to this draft: {changes}.</p>}
      {!!sources.length && <h4>Research sources</h4>}
      <ul>
        {sources.map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          </li>
        ))}
      </ul>
      {onManage && canManage && (
        <button className="research-text-action" onClick={onManage}>
          Manage sources
        </button>
      )}
    </section>
  );
}

function referenceSummary(research?: ResearchContext) {
  const sources = research?.sources ?? [];
  return {
    sources,
    changes: savedResearchLabel(research?.saved),
    canManage: sources.length > 0 || !!research?.saved?.sources,
  };
}

export function savedResearchLabel(saved: ResearchContext["saved"]) {
  if (!saved) return "";
  const labels = [];
  if (saved.sources)
    labels.push(
      `${saved.sources} ${saved.sources === 1 ? "source" : "sources"}`,
    );
  if (saved.notes)
    labels.push(
      `${saved.notes} ${saved.notes === 1 ? "thinking note" : "thinking notes"}`,
    );
  return labels.join(" and ");
}
