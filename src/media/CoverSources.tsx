import { useRef } from "react";
import { ChevronDown, ImagePlus, Upload, Images, FileImage, AudioLines, Link, Check, Video } from "lucide-react";
import "../cover-picker.css";
import type { CoverPickerController } from "./useCoverPicker";

type Props = {
  onGenerate?: () => void;
  imageOnly?: boolean;
  label?: string;
  mediaLabel?: string;
  state: Pick<CoverPickerController, "images" | "source" | "setSource" | "uploading" | "setError" | "selected">;
};
const sources = [
  { value: "upload", title: "Upload image", detail: "Choose a file from your device", icon: Upload },
  { value: "library", title: "Media library", detail: "Use an image you’ve already added", icon: Images },
  { value: "content", title: "From this post", detail: "Pick an image from your story", icon: FileImage },
  { value: "audio", title: "Audio cover", detail: "Upload audio or link Spotify, SoundCloud & more", icon: AudioLines },
  { value: "video", title: "Video cover", detail: "Upload or choose a video, or add a player link", icon: Video },
  { value: "url", title: "Image URL", detail: "Add an image with a link", icon: Link },
] as const;

export default function CoverSources({ state, onGenerate, imageOnly = false, label = "Cover media source", mediaLabel = "cover media" }: Props) {
  const { images, source, setSource, uploading, setError, selected } = state;
  const disclosure = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const choices = imageOnly ? sources.filter(item => item.value !== "content" && item.value !== "audio" && item.value !== "video") : sources;
  const active = sourcePresentation(source, selected, mediaLabel);
  const Icon = active.icon;
  function close() {
    if (disclosure.current) disclosure.current.open = false;
    trigger.current?.focus();
  }
  return (
    <details className="cover-sources" ref={disclosure}
      onKeyDown={event => { if (event.key === "Escape" && disclosure.current?.open) { event.preventDefault(); event.stopPropagation(); close(); } }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && disclosure.current) disclosure.current.open = false; }}>
      <summary ref={trigger} aria-disabled={uploading} onClick={event => { if (uploading) event.preventDefault(); }}>
        <span className="cover-source-icon"><Icon size={19} aria-hidden="true" /></span>
        <span>{active.title}<small>{active.detail}</small></span>
        <ChevronDown size={16} className="cover-source-chevron" aria-hidden="true" />
      </summary>
      <div className="cover-source-options" role="group" aria-label={label}>
        {choices.map(item => <button key={item.value} type="button" disabled={uploading} aria-pressed={source === item.value} onClick={() => { setSource(item.value); setError(""); close(); }}>
          <item.icon size={18} aria-hidden="true" />
          <span>{item.title}{item.value === "content" && images.length > 0 ? ` (${images.length})` : ""}<small>{item.detail}</small></span>
          {source === item.value && <Check size={15} aria-hidden="true" />}
        </button>)}
        {onGenerate && <button type="button" disabled={uploading} onClick={() => { close(); onGenerate(); }}>
          <ImagePlus size={18} aria-hidden="true" />
          <span>Generate image<small>Create an image from your article</small></span>
        </button>}
      </div>
    </details>
  );
}

function sourcePresentation(source: string, selected: unknown, mediaLabel: string) {
  return sources.find(item => item.value === source) ?? {
    icon: ImagePlus,
    title: `${selected ? "Change" : "Choose"} ${mediaLabel}`,
    detail: "Upload, browse your library, or add a link",
  };
}
