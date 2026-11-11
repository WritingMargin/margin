import { mediaDefaultTag } from "../../shared/media-defaults";
import { useMediaDefaults } from "../media/useMediaDefaults";
import { mediaPath } from "../base-path";
import { ArrowUpRight,Download } from "lucide-react";
import "../ai.css";
import { stamp } from "./helpers";
import type { AIPanelController } from "./useAIStudio";
import { generatedImageTitle, generatedImageFilename } from "../../shared/image-title";
type Props = {
  state: Pick<
    AIPanelController,
    | "post"
    | "onInsert"
    | "onUseImage"
    | "imagePurpose"
    | "notify"
    | "published"
    | "size"
    | "prompt"
    | "result"
    | "image"
  >;
};
export default function GeneratedImagePreview({ state }: Props) {
  const media = useMediaDefaults();
  const { onInsert, onUseImage, image } = state;
  if (!image) return null;
  const title = generatedImageTitle(image);
  return (
    <section className="ai-image-result">
      <h3>{title}</h3>
      <img src={mediaPath(image.url)} alt={title} />
      <div className="ai-image-actions">
        <button
          className="button primary"
          onClick={() => {
            onUseImage(image.url);
          }}
        >
          {state.imagePurpose === "sharing" ? "Use as sharing image" : "Use as cover"}
          <ArrowUpRight size={14} />
        </button>
        <button
          className="button"
          disabled={media.loading || !!media.error}
          onClick={() =>
            onInsert(
              `\n\n${mediaDefaultTag("image", { ...media.defaults.image, src: image.url, alt: title })}\n\n`,
            )
          }
        >
          Insert in article
        </button>
        <a
          className="button"
          href={mediaPath(image.url)}
          download={generatedImageFilename(title)}
        >
          <Download size={14} />
          Download
        </a>
      </div>
      {media.error && <p className="error-box" role="alert">Could not load media defaults. <button className="button" onClick={media.retry}>Retry</button></p>}
      <details>
        <summary>Image brief · {stamp(image.createdAt)}</summary>
        <p>{image.prompt}</p>
      </details>
      <p className="small-text">
        Saved to your media library. It becomes public when you use it in a
        published post.
      </p>
    </section>
  );
}
