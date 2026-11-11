import { previewMediaBase } from "../shared/preview-media";
import { mediaPath, unmountPath } from "./base-path";
import { resolveVideo } from "../shared/video";
import { coverPath } from "../shared/cover";

/** Remote HTTP media and canonical stored images; never arbitrary local URLs. */
export function safeMediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const local = unmountPath(value);
  const canonical = previewMediaBase(local);
  if (coverPath.test(canonical)) return mediaPath(local);
  if (
    /^\/api\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/.test(
      canonical,
    )
  )
    return mediaPath(local);
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Native video URLs are allowed only for video blocks, never image sources. */
export function safeVideoUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  const local = unmountPath(value.trim());
  return resolveVideo(local) ? mediaPath(local) : undefined;
}
