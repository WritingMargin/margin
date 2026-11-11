import { resolveAudio } from "../shared/audio";
import AudioMedia from "./AudioMedia";
import { safeMediaUrl } from "./media";
import { unmountPath } from "./base-path";
import { resolveVideo } from "../shared/video";
import VideoMedia from "./VideoMedia";

export function hasCover(value: string) {
  return !!(resolveAudio(unmountPath(value)) || resolveVideo(unmountPath(value)) || safeMediaUrl(value));
}
export default function CoverMedia({ src, className, alt = "", thumbnail = false, title, mode = "player" }: { title?: string; mode?: string; src: string; className?: string; alt?: string; thumbnail?: boolean }) {
  if (resolveAudio(unmountPath(src))) {
    return <AudioCover src={src} title={title} mode={mode} thumbnail={thumbnail} />;
  }
  if (resolveVideo(unmountPath(src))) {
    return <VideoCover src={src} title={title || alt || "Article video"} className={className} thumbnail={thumbnail} />;
  }
  const image = safeMediaUrl(src);
  return image ? <img className={className} src={image} alt={alt} loading={thumbnail ? "lazy" : undefined} /> : null;
}

function AudioCover({ src, title, mode, thumbnail }: { src: string; title?: string; mode: string; thumbnail: boolean }) {
  if (thumbnail) return <span className="audio-cover-badge">Listen & read</span>;
  return <div className="article-audio-cover"><AudioMedia title={title} mode={mode} src={src} /></div>;
}

function VideoCover({ src, title, className, thumbnail }: { src: string; title: string; className?: string; thumbnail: boolean }) {
  if (thumbnail) return <span className="video-cover-badge">Watch &amp; read</span>;
  return <div className={`article-video-cover ${className || ""}`}><VideoMedia src={src} title={title} ratio="16:9" /></div>;
}
