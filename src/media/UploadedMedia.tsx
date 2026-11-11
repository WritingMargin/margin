import UploadedMediaTabs from "./UploadedMediaTabs";
import UploadedAudio from "./UploadedAudio";
import { useEffect, useId, useState } from "react";
import { api } from "../api";
import { mediaPath } from "../base-path";
import { useCoverPicker } from "./useCoverPicker";
import { coverImageTypes } from "../../shared/cover";
import { galleryImageTitle, type GalleryAsset } from "./gallery-images";

import UploadedVideos from "./UploadedVideos";

type ImageAsset = GalleryAsset;
export default function UploadedMedia({ onSelect }: { onSelect: (url: string, kind: "image" | "video" | "audio") => void }) {
  const [kind, setKind] = useState<"image" | "video" | "audio">("image");
  const id = useId();
  return <>
    <UploadedMediaTabs id={id} kind={kind} onChange={setKind} />
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${kind}`}>
      {kind === "audio" ? <UploadedAudio onSelect={url => onSelect(url, "audio")} /> : kind === "image" ? <UploadedImages onSelect={url => onSelect(url, "image")} /> : <UploadedVideos onSelect={url => onSelect(url, "video")} />}
    </div>
  </>;
}
function UploadedImages({ onSelect }: { onSelect: (url: string) => void }) {
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
    {loading ? <p role="status">Opening uploaded images…</p> : <UploadedImageGrid images={images} onSelect={onSelect} />}
  </div>;
}
function UploadedImageGrid({ images, onSelect }: { images: ImageAsset[]; onSelect: (url: string) => void }) {
  if (!images.length) return <p className="muted">No uploaded images yet. Upload one to get started.</p>;
  return <div className="asset-grid" aria-label="Uploaded images">
    {images.map(image => <button key={image.public_id} onClick={() => onSelect(image.secure_url)} aria-label={`Preview image ${galleryImageTitle(image)}`}>
      <img src={mediaPath(image.secure_url)} alt={galleryImageTitle(image)} loading="lazy" />
      <span>{galleryImageTitle(image)}</span>
    </button>)}
  </div>;
}
