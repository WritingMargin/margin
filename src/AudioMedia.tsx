import AudioPlayer from "./AudioPlayer";
import { mediaIdentity } from "../shared/media-identity";
import { audioHelp, resolveAudio } from "../shared/audio";
import { mediaPath, unmountPath } from "./base-path";
import "./audio-media.css";

export default function AudioMedia({ src, title = "Listen to this article", mode = "player" }: { src: string; title?: string; mode?: string }) {
  const source = resolveAudio(unmountPath(src), mode);
  const identity = mediaIdentity("audio", unmountPath(src));
  if (!source) return <p className="audio-error" role="alert">{audioHelp}</p>;
  if (source.kind !== "audio") return <div className="audio-media audio-spotify" data-media-id={identity} data-media-provider={source.provider || source.kind}>
    <iframe src={source.src} title={`${source.provider || (source.kind === "spotify" ? "Spotify" : "SoundCloud")}: ${title}`} width="100%" height={source.height} loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    <a className="audio-source" href={source.url} target="_blank" rel="noopener noreferrer">Listen on {source.provider || (source.kind === "spotify" ? "Spotify" : "SoundCloud")}</a>
  </div>;
  return <div data-media-id={identity} data-media-provider="native"><AudioPlayer key={source.src} src={mediaPath(source.src)} title={title} /></div>;
}
