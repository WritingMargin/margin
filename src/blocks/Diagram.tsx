import mermaid from "mermaid";
import { useEffect, useId, useState } from "react";
import { diagramTheme } from "./diagram-theme";

mermaid.initialize({
  ...diagramTheme,
  startOnLoad: false,
  securityLevel: "strict",
  suppressErrorRendering: true,
  maxTextSize: 50_000,
  maxEdges: 300,
  secure: [
    "secure",
    "securityLevel",
    "startOnLoad",
    "maxTextSize",
    "maxEdges",
    "suppressErrorRendering",
    "htmlLabels",
    "flowchart",
  ],
});

export default function Diagram({ source }: { source: string }) {
  const id = "diagram-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [naturalWidth, setNaturalWidth] = useState<number>();
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let cancelled = false;
    // Debounce typing; Mermaid serializes rendering across all diagram instances.
    async function render() {
      try {
        // Mermaid measures labels during layout; wait for their actual typeface.
        await document.fonts?.load("400 14px Inter");
        if (cancelled) return;
        const result = await mermaid.render(id, source);
        if (cancelled) return;
        const parsedSvg = new DOMParser().parseFromString(
          result.svg,
          "image/svg+xml",
        );
        const width = Number(
          parsedSvg.documentElement
            .getAttribute("viewBox")
            ?.trim()
            .split(/[\s,]+/)[2],
        );
        setNaturalWidth(
          Number.isFinite(width) && width > 0 ? width : undefined,
        );
        setSvg(result.svg);
        setError("");
      } catch {
        if (!cancelled) {
          setSvg("");
          setError(
            "This diagram could not be rendered. Check the Mermaid syntax in the block source.",
          );
        }
      }
    }
    const timer = window.setTimeout(() => void render(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, source]);
  return (
    <>
      <div className="block-toolbar">
        <span>Mermaid diagram</span>
        <div className="block-segments">
          <button
            aria-label="Zoom out diagram"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => z - 0.25)}
          >
            −
          </button>
          <button
            onClick={() => setZoom(1)}
            aria-label="Fit diagram to available space"
          >
            {zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}
          </button>
          <button
            aria-label="Zoom in diagram"
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => z + 0.25)}
          >
            +
          </button>
        </div>
      </div>
      {error ? (
        <p className="block-error" role="status">
          {error}
        </p>
      ) : !svg ? (
        <p className="block-hint" role="status">
          Rendering diagram…
        </p>
      ) : (
        <div
          className="block-diagram-scroll"
          tabIndex={0}
          role="region"
          aria-label="Diagram. Scroll to explore when zoomed."
        >
          <div
            className="block-diagram"
            style={{
              width: `${zoom * 100}%`,
              maxWidth: naturalWidth ? `${naturalWidth * zoom}px` : undefined,
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
    </>
  );
}
