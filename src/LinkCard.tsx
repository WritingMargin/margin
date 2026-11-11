import { useState } from "react";
import { linkURL } from "../shared/link-preview";
import "./link-card.css";
import FigmaEmbed from "./blocks/FigmaEmbed";

type LinkCardProps = { url: string; title?: string; description?: string; image?: string; mode?: string };

export default function LinkCard({ url, title, mode, ...details }: LinkCardProps) {
  const target = linkURL(url);
  if (!target) return <p role="alert">Add a valid HTTP or HTTPS link.</p>;
  if (mode === "link") return <a href={target} rel="noopener noreferrer">{title || target}</a>;
  if (mode === "figma") return <FigmaEmbed key={target} url={target} title={title} />;
  return <LinkPreview url={target} title={title} {...details} />;
}

function LinkPreview({ url: target, title, description, image = "" }: LinkCardProps) {
  const [failedImage, setFailedImage] = useState("");
  const host = new URL(target).hostname;
  const artwork = linkURL(image);
  return <a className="link-preview-card" href={target} rel="noopener noreferrer">
    {artwork && artwork !== failedImage && <img src={artwork} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(artwork)} />}
    <span className="link-preview-body"><span className="link-preview-domain">{host}</span><strong>{title || host}</strong>{description && <span className="link-preview-description">{description}</span>}<span className="link-preview-action">Read more ↗</span></span>
  </a>;
}
