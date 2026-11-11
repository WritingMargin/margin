import HeroVideoControls from "./HeroVideoControls";
import Select from "../components/Select";
import type { HomepageDesign } from "../../shared/types";
import type { DesignerController } from "./useDesigner";

type Props = {
  state: Pick<DesignerController, "local" | "home" | "uploadArtwork" | "uploadingLogo" | "uploadHeroVideo" | "uploadingVideo">;
};

export default function ArtworkControls({ state }: Props) {
  const { local: { homepage }, home, uploadArtwork, uploadingLogo, uploadHeroVideo, uploadingVideo } = state;
  const kind = homepage.artworkType || "logo";
  return (
    <div className="artwork-controls">
      <label>
        Artwork source
        <Select value={kind} onChange={e => home({ artworkType: e.target.value as HomepageDesign["artworkType"] })}>
          <option value="logo">Blog logo</option>
          <option value="emoji">Emoji</option>
          <option value="image">Artwork image</option>
          <option value="video">Video</option>
        </Select>
      </label>
      {kind === "logo" && <p className="muted">Uses your blog logo, or the Margin icon when no logo is set.</p>}
      {kind === "emoji" && (
        <label>
          Emoji or symbol
          <input value={homepage.artworkEmoji ?? "✳"} maxLength={32} placeholder="🌿" onChange={e => home({ artworkEmoji: e.target.value })} />
        </label>
      )}
      {kind === "video" && <HeroVideoControls value={homepage.artworkVideo ?? ""} onChange={artworkVideo => home({ artworkVideo })} upload={uploadHeroVideo} uploading={uploadingVideo} />}
      {kind === "image" && (
        <>
          <label>
            Upload artwork
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploadingLogo} onChange={uploadArtwork} />
            <small className="muted">PNG, JPEG, WebP, or GIF · up to 2 MB</small>
          </label>
          <label>
            Or use an image URL
            <input type="url" value={homepage.artworkImage || ""} maxLength={2048} placeholder="https://…" disabled={uploadingLogo} onChange={e => home({ artworkImage: e.target.value })} />
          </label>
          <p className="muted">Shown in the homepage artwork only. Save your design to publish it.</p>
          {homepage.artworkImage && <button type="button" className="button" disabled={uploadingLogo} onClick={() => home({ artworkImage: "" })}>Remove artwork image</button>}
        </>
      )}
    </div>
  );
}
