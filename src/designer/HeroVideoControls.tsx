import { useEffect, useState } from "react";
import { api } from "../api";
import SearchableSelect from "../components/SearchableSelect";

type UploadedVideo = { public_id: string; secure_url: string; title: string; sizeBytes: number };

export default function HeroVideoControls({ value, onChange, upload, uploading }: {
  value: string; onChange: (value: string) => void; upload: React.ChangeEventHandler<HTMLInputElement>; uploading: boolean;
}) {
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (uploading) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ resources: UploadedVideo[] }>("/media/videos", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setVideos(result.resources); })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load uploaded videos."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [uploading, attempt]);
  return <>
    <SearchableSelect label="Hero video" searchLabel="Search uploaded videos" placeholder={loading ? "Loading uploaded videos…" : "Choose an uploaded video"} value={value} disabled={loading || uploading} onChange={onChange} options={videoOptions(videos, value)} />
    {error && <p className="error-box" role="alert">{error} <button type="button" className="button" onClick={() => setAttempt(current => current + 1)}>Retry</button></p>}
    {!loading && !error && !videos.length && <p className="muted">No uploaded videos yet. Upload one below to get started.</p>}
    <label>Upload a hero video<input type="file" accept="video/mp4,video/webm" disabled={uploading} onChange={upload} /><small className="muted">MP4 or WebM · up to 50 MiB</small></label>
    <p className="muted">{uploading ? "Uploading video…" : "Visitors choose when to play. Save your design to publish the video."}</p>
    {value && <button type="button" className="button" disabled={uploading} onClick={() => onChange("")}>Remove hero video</button>}
  </>;
}

function videoOptions(videos: UploadedVideo[], value: string) {
  const options = videos.map(video => ({ value: video.secure_url, label: `${video.title || "Untitled video"} · ${(video.sizeBytes / 1024 / 1024).toFixed(1)} MiB` }));
  if (value && !options.some(option => option.value === value)) options.unshift({ value, label: /^https?:/.test(value) ? "Current linked video" : "Current selected video" });
  return options;
}
