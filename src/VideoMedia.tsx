import { useEffect,useRef,useState,type CSSProperties } from "react";
import { mediaIdentity } from "../shared/media-identity";
import { resolveVideo,videoHelp } from "../shared/video";
import { videoLayout } from "../shared/video-layout";
import "./video-media.css";
import StickyVideo from "./StickyVideo";
import { mediaPath, unmountPath } from "./base-path";

export default function VideoMedia({
  src,
  title = "Video",
  ratio = "auto",
  sticky = false,
}: {
  src: string;
  title?: string;
  ratio?: string;
  sticky?: boolean | string;
}) {
  const source = resolveVideo(unmountPath(src));
  const identity = mediaIdentity("video", unmountPath(src));
  const layout = videoLayout({ ratio });
  const style = {
    "--video-ratio":
      layout.cssRatio === "auto" && source?.kind === "embed"
        ? "16 / 9"
        : layout.cssRatio,
  } as CSSProperties;
  if (!source)
    return (
      <p className="video-error" role="alert">
        {videoHelp}
      </p>
    );
  const player = source.kind === "embed" ? (
      <div className="video-embed" style={style} data-media-id={identity} data-media-provider={source.provider}>
        <iframe
          src={mediaPath(source.src)}
          title={`${source.provider}: ${title}`}
          loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    ) : (
    <div data-media-id={identity} data-media-provider="native"><PlayableVideo
      key={source.src}
      src={mediaPath(source.src)}
      hls={source.kind === "hls"}
      title={title}
      style={style}
    /></div>
  );
  return isSticky(sticky) ? <StickyVideo key={source.src} title={title}>{player}</StickyVideo> : player;
}

function PlayableVideo({
  src,
  hls,
  title,
  style,
}: {
  src: string;
  hls: boolean;
  title: string;
  style: CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const video = ref.current!;
    let disposed = false;
    let destroy: (() => void) | undefined;
    if (!hls) {
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    const load = async () => {
      try {
        const { default: Hls } = await import("hls.js");
        if (disposed) return;
        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = src;
            destroy = () => {
              video.removeAttribute("src");
              video.load();
            };
          } else setError("This browser cannot play this video stream.");
          return;
        }
        const player = new Hls({ maxBufferLength: 20 });
        destroy = () => player.destroy();
        player.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setError(
              "This video could not be loaded. Check the link and its playback permissions.",
            );
            player.destroy();
          }
        });
        player.loadSource(src);
        player.attachMedia(video);
      } catch {
        if (!disposed)
          setError("The video player could not load. Please reload the page.");
      }
    };
    // Defer player code and manifest requests until the video is near the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(video);
    return () => {
      disposed = true;
      observer.disconnect();
      destroy?.();
    };
  }, [src, hls]);
  return (
    <div className="video-file" style={style}>
      <video
        ref={ref}
        src={hls ? undefined : src}
        controls
        playsInline
        preload="metadata"
        aria-label={title}
        onLoadedMetadata={() => setError("")}
        onError={() =>
          setError(
            "This video could not be loaded. Check the link and its playback permissions.",
          )
        }
      />
      {error && (
        <p className="video-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function isSticky(value: boolean | string) { return value === true || value === "true"; }
