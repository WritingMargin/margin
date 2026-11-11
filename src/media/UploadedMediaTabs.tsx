import { AudioLines, Check, Film, Image, type LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import "./media-picker.css";

type Kind = "image" | "video" | "audio";
const options: { kind: Kind; title: string; description: string; Icon: LucideIcon }[] = [
  { kind: "image", title: "Images", description: "Photos & artwork", Icon: Image },
  { kind: "video", title: "Videos", description: "Clips & films", Icon: Film },
  { kind: "audio", title: "Audio", description: "Voice & podcasts", Icon: AudioLines },
];
export default function UploadedMediaTabs({ id, kind, onChange }: { id: string; kind: Kind; onChange: (kind: Kind) => void }) {
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = options.findIndex(option => option.kind === kind);
    const next = event.key === "ArrowLeft" ? current + 2 : current + 1;
    const index = event.key === "Home" ? 0 : event.key === "End" ? 2 : next % 3;
    onChange(options[index].kind);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[index]?.focus();
  }
  return <div className="uploaded-media-tabs" role="tablist" aria-label="Uploaded media type" onKeyDown={navigate}>
    {options.map(({ kind: value, title, description, Icon }) => <button type="button" key={value} role="tab" id={`${id}-${value}`} aria-label={title} aria-controls={`${id}-panel`} aria-selected={kind === value} tabIndex={kind === value ? 0 : -1} onClick={() => onChange(value)}>
      <span className="uploaded-type-icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
      <span className="uploaded-type-copy"><strong>{title}</strong><small>{description}</small></span>
      {kind === value && <Check className="uploaded-type-check" size={13} aria-hidden="true" />}
    </button>)}
  </div>;
}
