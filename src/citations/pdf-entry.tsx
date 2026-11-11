import { createRoot } from "react-dom/client";
import { useState } from "react";
import { citationPage, citationRect } from "../../shared/citations";
import PdfPage from "./PdfPage";

function SourceViewer({ url, title }: { url: string; title: string }) {
  const query = new URLSearchParams(window.location.search);
  const initial = citationPage(query.get("page") || "1");
  const rect = query.get("rect") || "";
  const [page, setPage] = useState(initial);
  const [count, setCount] = useState(0);
  return (
    <main className="pdf-viewer">
      <header>
        <div>
          <span>SOURCE DOCUMENT</span>
          <h1>{title}</h1>
        </div>
        <a
          href={`${url}#page=${page}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Original PDF ↗
        </a>
      </header>
      <nav aria-label="PDF pages">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ← Previous
        </button>
        <span>
          Page {page}
          {count ? ` of ${count}` : ""}
        </span>
        <button
          disabled={!count || page >= count}
          onClick={() => setPage(page + 1)}
        >
          Next →
        </button>
      </nav>
      {citationRect(rect) && page === initial && (
        <p className="pdf-selection-note">
          The cited area is highlighted below.
        </p>
      )}
      <PdfPage
        url={url}
        page={page}
        rect={page === initial ? rect : ""}
        onPageCount={setCount}
      />
    </main>
  );
}
const root = document.getElementById("source-root");
if (root?.dataset.url)
  createRoot(root).render(
    <SourceViewer
      url={root.dataset.url}
      title={root.dataset.title || "Source document"}
    />,
  );
