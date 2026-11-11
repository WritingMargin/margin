import {
  ArrowUpRight,
  CheckCheck,
  ChevronDown,
  ScanSearch,
} from "lucide-react";
import { useState } from "react";
import type { Post } from "../../shared/types";
import Select from "../components/Select";
import type { useArticleAudit } from "./useArticleAudit";
import "./article-audit.css";

type Audit = ReturnType<typeof useArticleAudit>;
type Report = NonNullable<Audit["last"]>["report"];
type Finding = Report["findings"][number];

const severityLabel = {
  error: "Needs a fix",
  warning: "Warning",
  suggestion: "Suggestion",
  unavailable: "Unavailable",
};
const titles: Record<string, string> = {
  "author.name": "Add a public author name",
  "author.website": "Link to the author’s profile",
  "article.image": "Choose a sharing image",
  "article.description": "Add a search description",
};

function resultCount(report?: Report) {
  if (!report) return "Review article";
  const count = report.findings.length;
  if (!count) return "Checks passed";
  return count === 1 ? "1 finding" : `${count} findings`;
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li>
      <details className="audit-finding">
        <summary>
          <span
            className={`audit-marker audit-marker-${finding.severity}`}
            aria-hidden="true"
          />
          <strong>{titles[finding.code] ?? finding.message}</strong>
          <span className="audit-severity">
            {severityLabel[finding.severity]}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="audit-explanation">
          <p>{finding.why}</p>
          {finding.passage && <blockquote>{finding.passage}</blockquote>}
          <p>{finding.fix}</p>
        </div>
      </details>
    </li>
  );
}

export default function ArticleAuditPanel({
  post,
  audit,
}: {
  post: Post;
  audit: Audit;
}) {
  const report = audit.last?.id === post.id ? audit.last.report : undefined;
  return (
    <details className="article-seo-audit">
      <summary className="audit-toggle">
        <ScanSearch size={17} aria-hidden="true" />
        <strong>SEO checks</strong>
        <span className="audit-count">{resultCount(report)}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="audit-body">
        <AuditControls post={post} audit={audit} />
        <div aria-live="polite">
          {audit.pending && <p role="status">Checking article…</p>}
          {report && <AuditResults report={report} />}
        </div>
      </div>
    </details>
  );
}

function AuditControls({ post, audit }: { post: Post; audit: Audit }) {
  const live = Boolean(post.id && post.status === "published");
  const [target, setTarget] = useState<Report["mode"]>(live ? "public" : "draft");
  return (
    <div className="audit-toolbar">
      <label>Version
        <Select value={live ? target : "draft"} disabled={!live || audit.pending}
          onChange={event => setTarget(event.target.value as Report["mode"])}>
          {live && <option value="public">Published page</option>}
          <option value="draft">Editor draft</option>
        </Select>
      </label>
      <label>Expected visibility
        <Select value={audit.intent} disabled={audit.pending}
          onChange={event => audit.setIntent(event.target.value as Audit["intent"])}>
          <option value="configured">Article default</option>
          <option value="index">Appear in search</option>
          <option value="hidden">Stay out of search</option>
        </Select>
      </label>
      <button type="button" className="button primary" disabled={audit.pending}
        onClick={() => void audit.run(post, live ? target : "draft")}>
        {audit.pending ? "Checking…" : "Run check"}
      </button>
    </div>
  );
}

function AuditResults({ report }: { report: Report }) {
  return (
    <section className="audit-results">
      <div className="audit-caption">
        <span>
          {report.mode === "public" ? "Published page" : "Editor version"}
        </span>
        {report.mode === "public" && report.url && (
          <a href={report.url} target="_blank" rel="noreferrer">
            View article <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        )}
      </div>
      {report.findings.length ? (
        <ul>
          {report.findings.map((item) => (
            <FindingRow key={item.code} finding={item} />
          ))}
        </ul>
      ) : (
        <p className="audit-clear">
          <CheckCheck size={15} /> All checks passed.
        </p>
      )}
    </section>
  );
}
