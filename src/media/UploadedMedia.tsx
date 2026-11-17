import UploadedMediaTabs from "./UploadedMediaTabs";
import UploadedAudio from "./UploadedAudio";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api";
import { mediaPath } from "../base-path";
import { useCoverPicker } from "./useCoverPicker";
import { coverImageTypes } from "../../shared/cover";
import { galleryImageTitle, type GalleryAsset } from "./gallery-images";
import { MoreVertical, Trash2 } from "lucide-react";
import ConfirmDialog from "../admin/ConfirmDialog";
import { useConfirmation } from "../admin/useConfirmation";

import UploadedVideos from "./UploadedVideos";

type ImageAsset = GalleryAsset;
export default function UploadedMedia({ onSelect, notify }: { onSelect: (url: string, kind: "image" | "video" | "audio") => void; notify: (message: string) => void }) {
  const [kind, setKind] = useState<"image" | "video" | "audio">("image");
  const id = useId();
  return <>
    <UploadedMediaTabs id={id} kind={kind} onChange={setKind} />
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${kind}`}>
      {kind === "audio" ? <UploadedAudio onSelect={url => onSelect(url, "audio")} /> : kind === "image" ? <UploadedImages onSelect={url => onSelect(url, "image")} notify={notify} /> : <UploadedVideos onSelect={url => onSelect(url, "video")} />}
    </div>
  </>;
}
function UploadedImages({ onSelect, notify }: { onSelect: (url: string) => void; notify: (message: string) => void }) {
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const upload = useCoverPicker({ content: "", value: "", onChange: url => { setAttempt(value => value + 1); onSelect(url); } });
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ resources: ImageAsset[] }>("/media/images?source=uploads", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setImages(result.resources); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <div className="media-picker-body">
    <p className="muted">Uploaded and generated images stored in Margin. Select an image to preview it. No Cloudinary connection is needed.</p>
    <input ref={upload.file} type="file" accept={coverImageTypes.join(",")} hidden onChange={upload.uploadCover} />
    <button className="button" disabled={upload.uploading} onClick={() => upload.file.current?.click()}>{upload.uploading ? "Uploading…" : "Upload image"}</button>
    {(error || upload.error) && <p className="error-box" role="alert">{error || upload.error}<button className="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {loading ? <p role="status">Opening uploaded images…</p> : <UploadedImageGrid images={images} onSelect={onSelect} notify={notify} onDeleted={id => setImages(list => list.filter(image => image.public_id !== id))} />}
  </div>;
}
function UploadedImageGrid({ images, onSelect, notify, onDeleted }: { images: ImageAsset[]; onSelect: (url: string) => void; notify: (message: string) => void; onDeleted: (id: string) => void }) {
  if (!images.length) return <p className="muted">No uploaded images yet. Upload one to get started.</p>;
  return <div className="asset-grid" aria-label="Uploaded images">
    {images.map(image => <ImageAsset key={image.public_id} image={image} onSelect={onSelect} notify={notify} onDeleted={onDeleted} />)}
  </div>;
}
function ImageAsset({ image, onSelect, notify, onDeleted }: { image: ImageAsset; onSelect: (url: string) => void; notify: (message: string) => void; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const confirmation = useConfirmation();
  const label = galleryImageTitle(image);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function remove() {
    setOpen(false);
    const accepted = await confirmation.ask({
      title: "Delete this image?",
      description: `“${label}” will be permanently removed from your media library. Images used by an article, saved draft or publication setting cannot be deleted.`,
      confirmLabel: "Delete image",
      cancelLabel: "Keep image",
    });
    if (!accepted) return;
    setDeleting(true);
    try {
      await api(`/media/images/${encodeURIComponent(image.public_id)}`, { method: "DELETE" });
      onDeleted(image.public_id);
      notify(`Deleted ${label}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The image could not be deleted.");
    } finally {
      setDeleting(false);
    }
  }
  return <div className="asset-card" aria-busy={deleting}>
    <button type="button" className="asset-card-open" disabled={deleting} onClick={() => onSelect(image.secure_url)} aria-label={`Preview image ${label}`}>
      <img src={mediaPath(image.secure_url)} alt={label} loading="lazy" />
      <span>{label}</span>
    </button>
    <button ref={trigger} type="button" className="asset-card-options" disabled={deleting}
      aria-haspopup="menu" aria-expanded={open} aria-label={`Options for ${label}`}
      onClick={() => setOpen(value => !value)}>
      <MoreVertical size={15} aria-hidden="true" />
    </button>
    {open && <div ref={menu} className="asset-card-menu" role="menu" aria-label={`Options for ${label}`}>
      <button type="button" role="menuitem" disabled={deleting} onClick={() => void remove()}>
        <Trash2 size={13} aria-hidden="true" />{deleting ? "Deleting…" : "Delete"}
      </button>
    </div>}
    <ConfirmDialog confirmation={confirmation} icon={<Trash2 size={21} />} />
  </div>;
}
