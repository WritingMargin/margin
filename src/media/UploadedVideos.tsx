import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api } from "../api";
import { mediaPath } from "../base-path";

type VideoAsset = { public_id: string; secure_url: string; title: string; sizeBytes: number };
export default function UploadedVideos({ onSelect }: { onSelect: (url: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ resources: VideoAsset[] }>("/media/videos", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setVideos(result.resources); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["video/mp4", "video/webm"].includes(file.type) || file.size > 50 * 1024 * 1024) {
      setError("Choose an MP4 or WebM video up to 50 MiB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const result = await api<{ url: string }>(`/media/videos?title=${encodeURIComponent(file.name.slice(0, 200))}`, {
        method: "POST", headers: { "Content-Type": file.type }, body: file,
      });
      setAttempt(value => value + 1);
      onSelect(result.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The video could not be uploaded.");
    } finally { setUploading(false); }
  }
  return <div className="media-picker-body">
    <p className="muted">Videos stored in Margin. Upload an MP4 or WebM up to 50 MiB, then select it to preview.</p>
    <input ref={fileInput} type="file" accept="video/mp4,video/webm" hidden onChange={upload} />
    <button className="button" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? "Uploading…" : "Upload video"}</button>
    {error && <p className="error-box" role="alert">{error}<button className="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {loading ? <p role="status">Opening uploaded videos…</p> : <UploadedVideoGrid videos={videos} onSelect={onSelect} />}
  </div>;
}
function UploadedVideoGrid({ videos, onSelect }: { videos: VideoAsset[]; onSelect: (url: string) => void }) {
  if (!videos.length) return <p className="muted">No uploaded videos yet. Upload one to get started.</p>;
  return <div className="asset-grid" aria-label="Uploaded videos">
    {videos.map(video => <button key={video.public_id} onClick={() => onSelect(video.secure_url)} aria-label={`Preview video ${video.title || "Untitled video"}`}>
      <video src={mediaPath(video.secure_url)} muted playsInline preload="metadata" aria-hidden="true" />
      <span>{video.title || "Untitled video"} · {(video.sizeBytes / 1024 / 1024).toFixed(1)} MiB</span>
    </button>)}
  </div>;
}
