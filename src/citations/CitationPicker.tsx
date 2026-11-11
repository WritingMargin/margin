import { lazy, Suspense, useEffect, useState } from "react";
import {
  citationPage,
  citationTag,
  citationURL,
  documentPath,
  type Citation,
} from "../../shared/citations";
import { tagAttributes } from "../../shared/content-tags";
import { api } from "../api";
import { mediaPath, sitePath } from "../base-path";
import "./pdf.css";
const PdfPage = lazy(() => import("./PdfPage"));
type Document = { id: string; title: string; url: string };
export default function CitationPicker({
  onInsert,
}: {
  onInsert: (before: string, after?: string) => void;
}) {
  const [source, setSource] = useState<Citation>({
    url: "",
    title: "",
    quote: "",
    page: "",
    rect: "",
  });
  const [mode, setMode] = useState("url");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const update = (patch: Partial<Citation>) =>
    setSource((previous) => ({ ...previous, ...patch }));
  useEffect(() => {
    void api<Document[]>("/media/documents")
      .then(setDocuments)
      .catch((e) => setError(e.message));
  }, []);
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("Choose a PDF up to 20 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        sitePath(
          `/api/media/documents?title=${encodeURIComponent(file.name.slice(0, 250))}`,
        ),
        {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The upload failed.");
      setDocuments((previous) => [result, ...previous]);
      update({ url: result.url, title: result.title, page: "1", rect: "" });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const insert = () => {
    try {
      citationTag(source, "");
      if (count && citationPage(source.page) > count)
        throw new Error("Choose a page within this PDF.");
      onInsert(
        `[Citation${tagAttributes(Object.fromEntries(Object.entries(source).filter(([, value]) => value)))}]`,
        "[/Citation]",
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  };
  return (
    <div className="citation-builder dialog-stack">
      <header className="dialog-header">
        <span className="eyebrow">GIVE YOUR WORDS A SOURCE</span>
        <h2>Add a citation.</h2>
      </header>
      <div className="dialog-body">
        <p className="muted">
          Select text in your article first. The citation wraps that selection;
          only tagged text is highlighted.
        </p>
        <div className="source-mode">
          <button
            aria-pressed={mode === "url"}
            onClick={() => {
              setMode("url");
              update({ url: "", page: "", rect: "" });
            }}
          >
            Website or PDF link
          </button>
          <button
            aria-pressed={mode === "pdf"}
            onClick={() => {
              setMode("pdf");
              update({ url: "", page: "1", rect: "" });
            }}
          >
            PDF library
          </button>
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {mode === "url" ? (
          <>
            <label>
              Source URL
              <input
                type="url"
                placeholder="https://…"
                value={source.url}
                onChange={(e) => update({ url: e.target.value })}
              />
            </label>
            <label>
              PDF page (only for PDF links)
              <input
                type="number"
                min="1"
                max="100000"
                value={source.page}
                onChange={(e) => update({ page: e.target.value })}
              />
            </label>
            <p className="small-text">
              Website quotations use a link to the matching text. External PDF
              links open the chosen page where supported. Upload a PDF to select
              an exact area.
            </p>
          </>
        ) : (
          <>
            <label className="source-upload">
              Upload PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={busy}
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </label>
            <p className="small-text">
              Up to 20 MB. Uploaded sources become readable by everyone when
              cited in a published post.
            </p>
            {busy && <p role="status">Uploading PDF…</p>}
            <div className="pdf-library">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  aria-pressed={source.url === doc.url}
                  onClick={() => {
                    setCount(0);
                    update({
                      url: doc.url,
                      title: doc.title,
                      page: "1",
                      rect: "",
                    });
                  }}
                >
                  {doc.title}
                </button>
              ))}
            </div>
            {!documents.length && (
              <p className="small-text">Your uploaded PDFs will appear here.</p>
            )}
          </>
        )}
        <label>
          Source title
          <input
            value={source.title}
            maxLength={250}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Article or document title"
          />
        </label>
        <label>
          Exact source quotation
          <textarea
            rows={3}
            value={source.quote}
            onChange={(e) => update({ quote: e.target.value })}
            placeholder="Leave empty to use the text wrapped in the citation tag."
          />
        </label>
        {documentPath.test(source.url) && (
          <>
            <label>
              Page{count ? ` (1–${count})` : ""}
              <input
                type="number"
                min="1"
                max={count || 100000}
                value={source.page}
                onChange={(e) => update({ page: e.target.value, rect: "" })}
              />
            </label>
            <p className="small-text">
              Drag over the passage to highlight its exact location. For
              keyboard entry, use the area field below.
            </p>
            <Suspense fallback={<p>Loading PDF viewer…</p>}>
              <PdfPage
                url={mediaPath(source.url)}
                page={citationPage(source.page)}
                rect={source.rect}
                onPageCount={setCount}
                onSelect={(rect) => update({ rect })}
              />
            </Suspense>
            <label>
              Highlight area (left, top, width, height; each 0–1)
              <input
                value={source.rect}
                placeholder="0.1,0.2,0.8,0.1"
                onChange={(e) => update({ rect: e.target.value })}
              />
            </label>
          </>
        )}
      </div>
      <footer className="dialog-footer">
        <button
          className="primary-button citation-insert"
          disabled={busy || !citationURL(source.url)}
          onClick={insert}
        >
          Insert citation
        </button>
      </footer>
    </div>
  );
}
