import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api } from "../api";

type AudioAsset = { public_id: string; secure_url: string; title: string; sizeBytes: number };
const audioTypes: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac" };
export default function UploadedAudio({ onSelect }: { onSelect: (url: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [recordings, setRecordings] = useState<AudioAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<{ resources: AudioAsset[] }>("/media/audio", { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setRecordings(result.resources); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const contentType = audioTypes[file.name.split(".").at(-1)?.toLowerCase() || ""];
    if (!contentType || file.size > 50 * 1024 * 1024) { setError("Choose an MP3, M4A, WAV, Ogg, or FLAC file up to 50 MiB."); return; }
    setUploading(true);
    setError("");
    try {
      const result = await api<{ url: string }>(`/media/audio?title=${encodeURIComponent(file.name.slice(0, 200))}`, { method: "POST", headers: { "Content-Type": contentType }, body: file });
      setAttempt(value => value + 1);
      onSelect(result.url);
    } catch (error) { setError(error instanceof Error ? error.message : "The audio could not be uploaded."); }
    finally { setUploading(false); }
  }
  return <div className="media-picker-body">
    <p className="muted">Upload a recording: MP3, M4A, WAV, Ogg, or FLAC, up to 50 MiB.</p>
    <input ref={fileInput} type="file" aria-label="Upload audio" accept=".mp3,.m4a,.wav,.ogg,.oga,.flac" hidden disabled={uploading} onChange={upload} />
    <button type="button" className="button" disabled={uploading} onClick={() => fileInput.current?.click()}>{uploading ? "Uploading…" : "Upload audio"}</button>
    {error && <p className="error-box" role="alert">{error}<button type="button" className="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></p>}
    {loading ? <p role="status">Opening uploaded audio…</p> : recordings.length ? <div className="asset-grid" aria-label="Uploaded audio">
      {recordings.map(recording => <button type="button" key={recording.public_id} onClick={() => onSelect(recording.secure_url)} aria-label={`Select audio ${recording.title || "Untitled recording"}`}><span>{recording.title || "Untitled recording"} · {(recording.sizeBytes / 1024 / 1024).toFixed(1)} MiB</span></button>)}
    </div> : <p className="muted">No uploaded recordings yet.</p>}
  </div>;
}
