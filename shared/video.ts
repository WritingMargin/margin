import { previewMediaBase } from "./preview-media";
import { resolveHostedMedia } from "./hosted-media";

export type VideoSource = {
  kind: "embed" | "video" | "hls";
  provider: string;
  src: string;
};
export const videoHelp =
  "Use a YouTube, Vimeo, Descript, Riverside, VEED, Mux, or Cloudinary player link, a direct MP4, WebM, Ogg, or HLS URL, or a video upload.";

function seconds(value: string | null): string | undefined {
  if (!value) return;
  if (/^\d+$/.test(value)) return String(Number(value));
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (match && match[0])
    return String(
      Number(match[1] || 0) * 3600 +
        Number(match[2] || 0) * 60 +
        Number(match[3] || 0),
    );
}

function youtubeId(url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.hostname.endsWith("youtu.be")) return parts[0];
  if (url.pathname === "/watch") return url.searchParams.get("v");
  return ["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : undefined;
}
function youtube(url: URL): VideoSource | undefined {
  const id = youtubeId(url);
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) return;
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  const start = seconds(
    url.searchParams.get("start") ||
      url.searchParams.get("t") ||
      new URLSearchParams(url.hash.slice(1)).get("t"),
  );
  if (start) embed.searchParams.set("start", start);
  return { kind: "embed", provider: "YouTube", src: embed.href };
}
function vimeo(url: URL): VideoSource | undefined {
  const match =
    /^(?:\/video)?\/(\d+)(?:\/([a-zA-Z0-9]+))?\/?$/.exec(url.pathname) ||
    /^\/(?:channels\/[^/]+|groups\/[^/]+\/videos)\/(\d+)\/?$/.exec(
      url.pathname,
    );
  if (!match) return;
  const embed = new URL(`https://player.vimeo.com/video/${match[1]}`);
  const hash = url.searchParams.get("h") || match[2];
  if (hash && !/^[a-zA-Z0-9]+$/.test(hash)) return;
  if (hash) embed.searchParams.set("h", hash);
  const start = seconds(new URLSearchParams(url.hash.slice(1)).get("t"));
  if (start) embed.hash = `t=${start}s`;
  return { kind: "embed", provider: "Vimeo", src: embed.href };
}
function mux(url: URL): VideoSource | undefined {
  if (!/^\/[a-zA-Z0-9]+\/?$/.test(url.pathname)) return;
  const embed = new URL(url.href);
  embed.protocol = "https:";
  embed.port = "";
  embed.searchParams.delete("autoplay");
  return { kind: "embed", provider: "Mux", src: embed.href };
}
function cloudinary(url: URL): VideoSource | undefined {
  if (
    !/^\/embed\/?$/.test(url.pathname) ||
    !url.searchParams.get("cloud_name") ||
    !url.searchParams.get("public_id")
  )
    return;
  const embed = new URL(url.href);
  embed.protocol = "https:";
  embed.port = "";
  embed.searchParams.set("player[autoplay]", "false");
  return { kind: "embed", provider: "Cloudinary", src: embed.href };
}
function directVideo(url: URL): VideoSource | undefined {
  const host = url.hostname;
  const provider =
    host === "stream.mux.com"
      ? "Mux"
      : host === "res.cloudinary.com"
        ? "Cloudinary"
        : "Video";
  if (/\.m3u8$/i.test(url.pathname))
    return { kind: "hls", provider, src: url.href };
  if (
    /\.(mp4|webm|og[gv]|m4v)$/i.test(url.pathname) ||
    (host === "res.cloudinary.com" &&
      /^\/[^/]+\/video\/(upload|fetch|authenticated)\/.+/.test(url.pathname))
  )
    return { kind: "video", provider, src: url.href };
}
const players = new Map<string, (url: URL) => VideoSource | undefined>([
  ...[
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
    "www.youtu.be",
  ].map((host) => [host, youtube] as const),
  ...["vimeo.com", "www.vimeo.com", "player.vimeo.com"].map(
    (host) => [host, vimeo] as const,
  ),
  ["player.mux.com", mux],
  ["player.cloudinary.com", cloudinary],
]);
/** Only known player hosts become iframes. Other hosts must supply actual media files. */
export function resolveVideo(value: string): VideoSource | undefined {
  const local = value.trim();
  if (/^\/api\/public\/videos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(previewMediaBase(local)))
    return { kind: "video", provider: "Margin", src: local };
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return;
  const hosted = resolveHostedMedia(url);
  if (hosted) return { kind: "embed", provider: hosted.provider, src: hosted.src };
  const resolve = players.get(url.hostname.toLowerCase()) || directVideo;
  return resolve(url);
}
