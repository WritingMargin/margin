import type { Post } from "../../shared/types";
import { sitePath } from "../base-path";
import { ChevronDown, Download, FileCode2, FileText } from "lucide-react";
export default function ArticleDownloads({
  post,
  singular,
}: {
  post: Post;
  singular: string;
}) {
  if (post.status !== "published") return null;
  return (
    <details className="article-downloads">
      <summary aria-label={`Save this ${singular}`}>
        <Download size={15} aria-hidden="true" />
        <span className="article-action-label">Save</span>
        <ChevronDown
          className="download-chevron"
          size={12}
          aria-hidden="true"
        />
      </summary>
      <nav aria-label={`Download ${singular}`}>
        <span className="download-menu-label">TAKE IT WITH YOU</span>
        <a
          href={sitePath(
            `/post/${encodeURIComponent(post.slug)}/print?download=pdf`,
          )}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="download-format-icon">
            <FileText size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>Download as PDF</strong>
            <small>Opens the print dialog to save as PDF</small>
            <span className="sr-only">(opens in a new tab)</span>
          </span>
          <span className="download-extension" aria-hidden="true">
            PDF
          </span>
        </a>
        <a
          href={sitePath(
            `/posts/${encodeURIComponent(post.slug)}.md?download=1`,
          )}
          download={`${post.slug}.md`}
        >
          <span className="download-format-icon">
            <FileCode2 size={18} aria-hidden="true" />
          </span>
          <span>
            <strong>Download Markdown</strong>
            <small>The original text, ready to edit</small>
          </span>
          <span className="download-extension" aria-hidden="true">
            MD
          </span>
        </a>
      </nav>
    </details>
  );
}
