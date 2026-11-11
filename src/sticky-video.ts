export type StickyVideoState = { floating: boolean; pinned: boolean };

/** Reposition the existing player: never move, clone or restart its media element. */
export function attachStickyVideo(slot: HTMLElement, update: (state: StickyVideoState) => void) {
  const controller = new AbortController();
  const signal = controller.signal;
  const video = slot.querySelector("video");
  const panel = slot.querySelector<HTMLElement>(".sticky-video-player");
  const topLayer = (visible: boolean) => {
    if (!panel?.showPopover) return;
    if (visible) { panel.setAttribute("popover", "manual"); panel.showPopover(); }
    else if (panel.hasAttribute("popover")) { panel.hidePopover(); panel.removeAttribute("popover"); }
  };
  let pinned = false;
  let dismissed = false;
  let floating = false;
  let playing = !!video && !video.paused && !video.ended;
  let nativeFullscreen = false;
  const publish = () => update({ floating, pinned });
  const setFloating = (next: boolean) => {
    if (next === floating) return;
    floating = next;
    if (next) {
      slot.style.height = `${slot.getBoundingClientRect().height}px`;
      document.dispatchEvent(new CustomEvent("margin:video-floating", { detail: slot }));
    } else slot.style.removeProperty("height");
    // Top layer escapes article layout containment without reparenting the player.
    topLayer(next);
    publish();
  };
  const refresh = () => {
    const above = slot.getBoundingClientRect().bottom <= 0;
    setFloating(above && !dismissed && (pinned || playing || floating) && !document.fullscreenElement && !nativeFullscreen);
  };
  const dismiss = () => {
    dismissed = true;
    pinned = false;
    setFloating(false);
    publish();
  };
  const observer = new IntersectionObserver(refresh, { threshold: [0, 1] });
  observer.observe(slot);
  const resize = new ResizeObserver(refresh);
  resize.observe(slot);
  video?.addEventListener("playing", () => { playing = true; refresh(); }, { signal });
  video?.addEventListener("pause", () => { playing = false; if (!floating) refresh(); }, { signal });
  video?.addEventListener("ended", () => { playing = false; pinned = false; setFloating(false); publish(); }, { signal });
  video?.addEventListener("webkitbeginfullscreen", () => { nativeFullscreen = true; refresh(); }, { signal });
  video?.addEventListener("webkitendfullscreen", () => { nativeFullscreen = false; refresh(); }, { signal });
  document.addEventListener("fullscreenchange", refresh, { signal });
  document.addEventListener("margin:video-floating", event => {
    if (floating && (event as CustomEvent).detail !== slot) dismiss();
  }, { signal });
  slot.addEventListener("keydown", event => {
    if (event.key === "Escape" && floating && !document.fullscreenElement) {
      event.preventDefault();
      dismiss();
      slot.querySelector<HTMLButtonElement>(".sticky-video-pin")?.focus({ preventScroll: true });
    }
  }, { signal });
  return {
    pin() { pinned = !pinned; dismissed = !pinned; refresh(); publish(); },
    dismiss,
    returnToVideo() {
      slot.scrollIntoView({ behavior: "instant", block: "center" });
      setFloating(false);
      slot.querySelector<HTMLButtonElement>(".sticky-video-pin")?.focus({ preventScroll: true });
    },
    stop() { controller.abort(); observer.disconnect(); resize.disconnect(); topLayer(false); slot.style.removeProperty("height"); },
  };
}
