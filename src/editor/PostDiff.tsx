import { useMemo } from "react";
import type { Post } from "../../shared/types";
import { changedFields, fieldValue } from "../../shared/post-conflicts";
import { textDiff } from "../../shared/text-diff";
import "./post-diff.css";
export function TextDiff({
  before,
  after,
  label,
}: {
  before: string;
  after: string;
  label: string;
}) {
  const diff = useMemo(() => textDiff(before, after), [before, after]);
  if (!diff)
    return (
      <p role="status">
        This change is too large for an inline diff. Review the complete texts
        before resolving it.
      </p>
    );
  return (
    <section className="text-diff" aria-label={`${label} changes`}>
      <header>
        <strong>{label}</strong>
        <span className="diff-added-count">+{diff.added} added</span>
        <span className="diff-removed-count">−{diff.removed} removed</span>
      </header>
      {!diff.hunks.length && <p className="diff-unchanged">No changes.</p>}
      {diff.hunks.map((hunk, index) => (
        <div key={index}>
          <div className="diff-hunk">{hunk.label}</div>
          {hunk.rows.map((row, n) => (
            <div key={n} className={`diff-line diff-${row.kind}`}>
              <span className="diff-number" aria-label="Old line">
                {row.oldLine}
              </span>
              <span className="diff-number" aria-label="New line">
                {row.newLine}
              </span>
              <span className="diff-sign">
                {row.kind === "added"
                  ? "+"
                  : row.kind === "removed"
                    ? "−"
                    : " "}
              </span>
              <code>{row.text || " "}</code>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
export default function PostDiff({
  before,
  after,
}: {
  before: Post;
  after: Post;
}) {
  const fields = changedFields(before, after);
  return (
    <div className="post-diff">
      <p className="diff-legend">
        Removed text is red (−). Added text is green (+). Replacements show
        both.
      </p>
      {!fields.length && <p>No article text or settings changed.</p>}
      {fields.map(([key, label]) => (
        <TextDiff
          key={key}
          label={label}
          before={fieldValue(before, key)}
          after={fieldValue(after, key)}
        />
      ))}
      {before.status !== after.status && (
        <p>
          Publication status: {before.status} → {after.status}
        </p>
      )}
    </div>
  );
}
export function emptyComparison(post: Post): Post {
  return {
    ...post,
    title: "",
    content: "",
    slug: "",
    excerpt: "",
    tags: [],
    cover: "",
    seo: { title: "", description: "", image: "" },
    recommendations: undefined,
  };
}
