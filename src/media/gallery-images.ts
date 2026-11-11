import { safeMediaUrl } from "../media";
import { unmountPath } from "../base-path";

export type GalleryAsset = {
  public_id: string;
  title?: string;
  secure_url: string;
  resource_type?: string;
  format?: string;
};

export function galleryImageTitle(asset: GalleryAsset): string {
  return asset.title?.trim() || asset.public_id.split("/").pop() || "Image";
}

// Covers are still images. Cloudinary can deliver a video's middle frame as JPG.
export function galleryImageURL(asset: GalleryAsset): string | undefined {
  const safe = safeMediaUrl(asset.secure_url);
  if (!safe) return;
  if (!asset.resource_type || asset.resource_type === "image")
    return unmountPath(safe);
  if (asset.resource_type !== "video") return;
  const video = new URL(safe, "https://margin.invalid");
  if (
    video.hostname !== "res.cloudinary.com" ||
    !/^\/[^/]+\/video\/upload\/.+/.test(video.pathname)
  )
    return;
  // Cloudinary also classifies audio as video; it cannot provide a cover frame.
  const format = asset.format || video.pathname.split(".").pop() || "";
  if (!/^(mp4|webm|mov|mkv|avi|m4v|ogv|mpeg|mpg|3gp|ts|m3u8)$/i.test(format))
    return;
  video.pathname =
    video.pathname.replace(new RegExp(`\\.${format}$`, "i"), "") + ".jpg";
  return video.href;
}
