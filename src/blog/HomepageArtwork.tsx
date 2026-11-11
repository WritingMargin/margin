import VideoMedia from "../VideoMedia";
import { ArrowDown } from "lucide-react";
import type { Theme } from "../../shared/types";
import { sitePath } from "../base-path";
import { safeLogoUrl } from "./theme";

export default function HomepageArtwork({ theme }: { theme: Theme }) {
  const design = theme.homepage;
  if (design.artworkType === "video") return design.artworkVideo ? <div className="homepage-hero-video"><VideoMedia src={design.artworkVideo} title={design.title || "Homepage video"} ratio="16:9" /></div> : null;
  const image = design.artworkType === "image" ? design.artworkImage : theme.logo;
  return (
    <div className="journal-art" aria-hidden="true">
      <div className="art-grid" />
      <div className="art-orbit">
        {design.artworkType === "emoji" ? (
          <span className="art-emoji">{design.artworkEmoji}</span>
        ) : (
          <img className="art-logo" src={safeLogoUrl(image) || sitePath("/api/public/brand.svg")} alt="" />
        )}
      </div>
      <span className="art-note">THOUGHTS, IN PROGRESS.</span>
      <ArrowDown size={26} />
    </div>
  );
}
