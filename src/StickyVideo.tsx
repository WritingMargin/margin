import { useEffect, useRef, useState, type ReactNode } from "react";
import { attachStickyVideo, type StickyVideoState } from "./sticky-video";
import "./sticky-video.css";

export default function StickyVideo({ children, title }: { children: ReactNode; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const controls = useRef<ReturnType<typeof attachStickyVideo> | null>(null);
  const [state, setState] = useState<StickyVideoState>({ floating: false, pinned: false });
  useEffect(() => {
    const slot = ref.current!;
    // Authoring previews stay inline, even when the post opts into floating playback.
    if (!slot.closest(".public-article") || slot.closest(".design-preview, .is-design-preview")) return;
    controls.current = attachStickyVideo(slot, setState);
    return () => { controls.current?.stop(); controls.current = null; };
  }, []);
  return <div ref={ref} className={`sticky-video-slot${state.floating ? " is-floating" : ""}`}>
    <div className="sticky-video-player" role={state.floating ? "region" : undefined} aria-label={state.floating ? `${title}, floating player` : undefined}>
      {children}
      <div className="sticky-video-controls">
        <button type="button" className="sticky-video-pin" aria-pressed={state.pinned} onClick={() => controls.current?.pin()}>{state.pinned ? "Keep inline" : "Keep visible"}</button>
        {state.floating && <>
          <button type="button" onClick={() => controls.current?.returnToVideo()}>Back to video</button>
          <button type="button" aria-label="Dismiss floating video" onClick={() => { controls.current?.dismiss(); ref.current?.querySelector<HTMLButtonElement>(".sticky-video-pin")?.focus({ preventScroll: true }); }}>×</button>
        </>}
      </div>
    </div>
  </div>;
}
