import { useState } from "react";

import { figmaEmbedUrl } from "../../shared/figma";

export default function FigmaEmbed({
  url,
  title = "Open in Figma",
}: {
  url: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const src = figmaEmbedUrl(url);
  if (!src)
    return (
      <p role="alert">Use a Figma design, prototype or FigJam share link.</p>
    );
  return (
    <section className="figma-embed" aria-label={title}>
      <div>
        <a href={url} target="_blank" rel="noopener noreferrer">
          {title} ↗
        </a>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Hide Figma embed" : "Load Figma embed"}
        </button>
      </div>
      {open && (
        <iframe
          src={src}
          title={title}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
    </section>
  );
}
