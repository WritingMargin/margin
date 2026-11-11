import { resolveAudio } from "../../shared/audio";
import { useEffect,useMemo,useRef,useState } from "react";
import { coverImageLimit,coverImageTypes } from "../../shared/cover";
import { api } from "../api";
import { contentImages } from "../content-images";
import "../cover-picker.css";
import { safeMediaUrl } from "../media";
import { resolveVideo } from "../../shared/video";
import { unmountPath } from "../base-path";

export function useCoverPicker({
  content,
  value,
  onChange,
  mode = "player",
  initialSource = "",
  onModeChange,
}: {
  initialSource?: "" | "upload" | "library" | "content" | "url" | "audio" | "video";
  mode?: "player" | "preview";
  onModeChange?: (mode: "player" | "preview") => void;
  content: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const images = useMemo(() => contentImages(content), [content]);
  const [source, setSource] = useState<"" | "upload" | "library" | "content" | "url" | "audio" | "video">(initialSource);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => () => request.current?.abort(), []);
  const selected = resolveAudio(unmountPath(value)) || resolveVideo(unmountPath(value)) ? value : safeMediaUrl(value);
  const uploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const image = e.target.files?.[0];
    e.target.value = "";
    if (!image) return;
    if (!coverImageTypes.includes(image.type) || image.size > coverImageLimit) {
      setError("Choose a PNG, JPEG, WebP, or GIF image up to 10 MB.");
      return;
    }
    setUploading(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await api<{ url: string }>("/media/covers", {
        method: "POST",
        headers: { "Content-Type": image.type },
        body: image,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) change.current(result.url);
    } catch (error) {
      if (!controller.signal.aborted) setError((error as Error).message);
    } finally {
      setUploading(false);
    }
  };
  return {
    mode,
    onModeChange,
    uploadCover,
    content,
    value,
    onChange,
    images,
    source,
    setSource,
    uploading,
    setUploading,
    error,
    setError,
    file,
    request,
    selected,
  };
}
export type CoverPickerController = ReturnType<typeof useCoverPicker>;
