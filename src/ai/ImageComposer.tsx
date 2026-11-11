import Select from "../components/Select";
import { ImagePlus,Loader2 } from "lucide-react";
import { type ImageSize,type ImageStyle } from "../../shared/ai";
import "../ai.css";
import GeneratedImagePreview from "./GeneratedImagePreview";
import ImageBrief from "./ImageBrief";
import type { AIPanelController } from "./useAIStudio";
type Props = {
  state: Pick<
    AIPanelController,
    | "post"
    | "onInsert"
    | "onUseImage"
    | "imagePurpose"
    | "notify"
    | "published"
    | "config"
    | "history"
    | "style"
    | "setStyle"
    | "size"
    | "setSize"
    | "prompt"
    | "setPrompt"
    | "busy"
    | "result"
    | "image"
    | "disabled"
    | "imageUnavailable"
    | "generate"
  >;
};
export default function ImageComposer({ state }: Props) {
  const {
    config,
    style,
    setStyle,
    size,
    setSize,
    busy,
    image,
    disabled,
    imageUnavailable,
    generate,
  } = state;
  return (
    <>
      <div className="ai-form-row">
        <label>
          Visual direction
          <Select
            value={style}
            onChange={(e) => setStyle(e.target.value as ImageStyle)}
            disabled={!!busy}
          >
            <option value="editorial">
              Editorial · considered & expressive
            </option>
            <option value="photographic">
              Photography · natural & cinematic
            </option>
            <option value="illustration">
              Illustration · warm & imaginative
            </option>
            <option value="minimal">Minimal · monochrome & graphic</option>
          </Select>
        </label>
        <label>
          Canvas
          <Select
            value={size}
            onChange={(e) => setSize(e.target.value as ImageSize)}
            disabled={!!busy}
          >
            <option value="1536x1024">Landscape · blog cover</option>
            <option value="1024x1024">Square · social post</option>
            <option value="1024x1536">Portrait · visual story</option>
          </Select>
        </label>
      </div>
      <ImageBrief state={state} />
      <ImageAvailability config={config} />
      <button
        className="button primary ai-generate"
        disabled={disabled || imageUnavailable}
        onClick={() => generate("images")}
      >
        {busy === "images" ? (
          <Loader2 size={15} className="spin" />
        ) : (
          <ImagePlus size={15} />
        )}{" "}
        {busy === "images"
          ? "Making something for your story…"
          : "Generate an image"}
      </button>
      {busy === "images" && (
        <p role="status" className="small-text">
          Images can take a few minutes. Finished results are saved in your
          history.
        </p>
      )}
      {image && <GeneratedImagePreview state={state} />}
    </>
  );
}

function ImageAvailability({ config }: Pick<AIPanelController, "config">) {
  if (!config) return null;
  if (!config.features?.image) return <p className="small-text" role="status">Image generation is unavailable for this workspace.</p>;
  if (!config.features.imageBrief) return <p className="muted">Automatic briefs are unavailable. Enter your own image brief to generate.</p>;
  return null;
}
