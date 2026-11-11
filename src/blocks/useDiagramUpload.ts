import { useEffect, useRef, useState } from "react";
import { uploadDiagramFile, type DiagramFileKind } from "./diagram-file";

export type { DiagramFileKind } from "./diagram-file";

export function useDiagramUpload(
  onUploaded: (kind: DiagramFileKind, url: string, file: File) => void,
) {
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => () => active.current?.abort(), []);

  async function upload(kind: DiagramFileKind, file: File) {
    if (active.current) return;
    setStatus("");
    setError("");
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setStatus(`Uploading ${file.name}…`);
    try {
      const asset = await uploadDiagramFile(kind, file, controller.signal);
      if (!controller.signal.aborted) {
        onUploaded(kind, asset.url, file);
        setStatus(`Uploaded ${file.name}.`);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setStatus("");
        setError(
          err instanceof Error
            ? err.message
            : "Upload failed. Please try again.",
        );
      }
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return { upload, busy, status, error };
}
