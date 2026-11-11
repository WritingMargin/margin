import { previewMediaBase } from "./preview-media";
import { resolveHostedMedia } from "./hosted-media";
import { resolveVideo } from "./video";

export type AudioSource = {
  kind: "audio" | "spotify" | "soundcloud" | "embed";
  provider?: string;
  src: string;
  url: string;
  height?: number;
};
export const audioHelp = "Use an MP3, M4A, AAC, WAV, Ogg, or FLAC link, a Spotify or SoundCloud link, a published Descript, Riverside or VEED player, or an audio upload.";
export const audioUploadPath = /^\/api\/public\/audio\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Only Spotify's exact host and known entity paths may create a player frame. */
export function resolveAudio(value: string, mode: string = "player"): AudioSource | undefined {
  const raw = value.trim();
  if (audioUploadPath.test(previewMediaBase(raw))) return { kind: "audio", src: raw, url: raw };
  let url: URL;
  try { url = new URL(raw); } catch { return; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return;
  return remoteAudio(url, mode);
}

function remoteAudio(url: URL, mode: string): AudioSource | undefined {
  const hosted = resolveHostedMedia(url);
  if (hosted) return { kind: "embed", ...hosted, height: 352 };
  if (url.hostname === "open.spotify.com") return spotifyAudio(url, mode);
  if (["soundcloud.com", "www.soundcloud.com", "w.soundcloud.com", "api.soundcloud.com"].includes(url.hostname)) return soundcloudAudio(url, mode);
  if (/\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(url.pathname))
    return { kind: "audio", src: url.href, url: url.href };
}

function spotifyAudio(url: URL, mode: string): AudioSource | undefined {
    if (url.port) return;
    const match = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(episode|show|track|album|playlist|artist)\/([a-zA-Z0-9]{22})\/?$/.exec(url.pathname);
    if (!match) return;
    const path = `${match[1]}/${match[2]}`;
    return { kind: "spotify", src: `https://open.spotify.com/embed/${path}`, url: `https://open.spotify.com/${path}`, height: mode === "preview" ? 352 : ["episode", "track"].includes(match[1]) ? 152 : 352 };
}

/** Audio and video covers must never be used in image tags or social image metadata. */
export function coverImage(value: string = ""): string {
  return resolveAudio(value) || resolveVideo(value) ? "" : value;
}

function soundcloudAudio(url: URL, mode: string): AudioSource | undefined {
  if (url.port) return;
  if (url.hostname === "w.soundcloud.com") return soundcloudWidget(url, mode);
  const target = soundcloudTarget(url);
  if (!target) return;
  const embed = new URL("https://w.soundcloud.com/player/");
  embed.searchParams.set("url", target.href);
  embed.searchParams.set("auto_play", "false");
  embed.searchParams.set("visual", mode === "preview" ? "true" : "false");
  embed.searchParams.set("show_artwork", mode === "preview" ? "true" : "false");
  return { kind: "soundcloud", src: embed.href, url: target.href, height: mode === "preview" ? 450 : 166 };
}

function soundcloudTarget(url: URL): URL | undefined {
  const valid = url.hostname === "api.soundcloud.com"
    ? /^\/(tracks|playlists)\/\d+\/?$/.test(url.pathname)
    : /^\/[a-zA-Z0-9_-]+\/(?:sets\/)?[a-zA-Z0-9_-]+(?:\/s-[a-zA-Z0-9]+)?\/?$/.test(url.pathname);
  if (!valid) return;
  const target = new URL(`https://${url.hostname === "www.soundcloud.com" ? "soundcloud.com" : url.hostname}${url.pathname}`);
  const secret = url.searchParams.get("secret_token");
  if (secret && /^s-[a-zA-Z0-9]+$/.test(secret)) target.searchParams.set("secret_token", secret);
  return target;
}

function soundcloudWidget(url: URL, mode: string): AudioSource | undefined {
 if (url.pathname !== "/player/") return;
 const nested = url.searchParams.get("url") || "";
 let target: URL;
 try { target = new URL(nested); } catch { return; }
 if (target.hostname === "w.soundcloud.com") return;
 const source = resolveAudio(nested, mode);
 return source?.kind === "soundcloud" ? source : undefined;
}
