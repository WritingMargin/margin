import { sitePath } from "../base-path";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { citationRect } from "../../shared/citations";
import "./pdf.css";

type Props = {
  url: string;
  page: number;
  rect?: string;
  onPageCount?: (count: number) => void;
  onSelect?: (rect: string) => void;
};
export default function PdfPage({
  url,
  page,
  rect = "",
  onPageCount,
  onSelect,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<number[] | null>(null);
  const origin = useRef<number[] | null>(null);
  const countCallback = useRef(onPageCount);
  countCallback.current = onPageCount;
  useEffect(() => {
    let active = true;
    let destroy: (() => void) | undefined;
    setLoading(true);
    setError("");
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const resources = sitePath(`/pdfjs/${pdfjs.version}/`);
      const task = pdfjs.getDocument({
        url,
        cMapUrl: resources + "cmaps/",
        cMapPacked: true,
        standardFontDataUrl: resources + "standard_fonts/",
        wasmUrl: resources + "wasm/",
        iccUrl: resources + "iccs/",
      });
      destroy = () => {
        void task.destroy();
      };
      const document = await task.promise;
      if (!active) return;
      countCallback.current?.(document.numPages);
      if (page > document.numPages)
        throw new Error("This PDF does not contain the selected page.");
      const pdfPage = await document.getPage(page);
      if (!active || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale: 1 });
      const scaled = pdfPage.getViewport({
        scale: Math.min(2, 1600 / Math.max(viewport.width, viewport.height)),
      });
      // Each render owns its canvas; cancelled tasks cannot paint the next page.
      const offscreen = window.document.createElement("canvas");
      offscreen.width = scaled.width;
      offscreen.height = scaled.height;
      await pdfPage.render({ canvas: offscreen, viewport: scaled }).promise;
      if (!active || !canvas.current) return;
      canvas.current.width = offscreen.width;
      canvas.current.height = offscreen.height;
      canvas.current.getContext("2d")!.drawImage(offscreen, 0, 0);
      setLoading(false);
    })().catch((cause) => {
      if (active) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to display this PDF.",
        );
        setLoading(false);
      }
    });
    return () => {
      active = false;
      destroy?.();
    };
  }, [url, page]);
  useEffect(() => {
    if (!loading && !onSelect && rect)
      highlight.current?.scrollIntoView({ block: "center" });
  }, [loading, onSelect, rect]);
  const position = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
      Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
    ];
  };
  const bounds = drag || citationRect(rect);
  return (
    <div className="pdf-page-wrap">
      {loading && <p role="status">Loading PDF page…</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div
        className={`pdf-page ${onSelect ? "can-select" : ""}`}
        hidden={loading || !!error}
        onPointerDown={(event) => {
          if (!onSelect || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          origin.current = position(event);
          setDrag(null);
        }}
        onPointerMove={(event) => {
          if (!origin.current) return;
          const point = position(event);
          setDrag([
            Math.min(point[0], origin.current[0]),
            Math.min(point[1], origin.current[1]),
            Math.abs(point[0] - origin.current[0]),
            Math.abs(point[1] - origin.current[1]),
          ]);
        }}
        onPointerUp={() => {
          if (drag && drag[2] > 0.005 && drag[3] > 0.005)
            onSelect?.(drag.map((value) => value.toFixed(5)).join(","));
          origin.current = null;
          setDrag(null);
        }}
        onPointerCancel={() => {
          origin.current = null;
          setDrag(null);
        }}
      >
        <canvas ref={canvas} role="img" aria-label={`PDF page ${page}`} />
        {bounds && (
          <span
            ref={highlight}
            className="pdf-highlight"
            aria-label="Cited area"
            style={{
              left: `${bounds[0] * 100}%`,
              top: `${bounds[1] * 100}%`,
              width: `${bounds[2] * 100}%`,
              height: `${bounds[3] * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}
