import type { MediaEventSink } from "./media-actions";
import { mediaMeasurement, type MediaMeasurement } from "./media-measurement";
import { trackNativeMedia } from "./media-native";
import { trackSoundCloud } from "./media-soundcloud";
import { trackSpotify } from "./media-spotify";
import { trackVimeo } from "./media-vimeo";
import { trackYouTube } from "./media-youtube";
import { trustedPlayer } from "./player-scripts";

const adapters = { youtube: trackYouTube, vimeo: trackVimeo, soundcloud: trackSoundCloud, spotify: trackSpotify };
function attachMedia(element: HTMLElement, measurement: MediaMeasurement) {
  const controller = new AbortController();
  const media = element.querySelector<HTMLMediaElement>("audio,video");
  if (media) {
    const native = trackNativeMedia(media, measurement);
    return { target: media, sample: native.sample, stop: native.stop };
  }
  const frame = element.querySelector<HTMLIFrameElement>("iframe");
  const provider = element.dataset.mediaProvider?.toLowerCase() || "";
  if (frame && trustedPlayer(frame, provider)) {
    const adapter = adapters[provider as keyof typeof adapters];
    void adapter(frame, measurement, controller.signal).catch(() => {
      // Failed or blocked APIs remain explicitly unmeasurable.
      controller.abort();
    });
  }
  return { target: frame, sample() {}, stop() { controller.abort(); } };
}
export function trackPageMedia(root: ParentNode | null, record: MediaEventSink = () => {}) {
  const measurements = new Map<string, MediaMeasurement>();
  const attached = new Map<HTMLElement, ReturnType<typeof attachMedia> & { id: string }>();
  function scan() {
    const elements = root?.querySelectorAll<HTMLElement>(".public-article [data-media-id], .homepage-hero-video [data-media-id], .template-hero-video [data-media-id]") || [];
    const present = new Set(elements);
    for (const [element, player] of attached) {
      const target = element.querySelector("audio,video,iframe");
      if (!present.has(element) || element.dataset.mediaId !== player.id || target !== player.target) {
        player.stop();
        attached.delete(element);
      }
    }
    for (const element of elements) attach(element);
  }
  function attach(element: HTMLElement) {
    const id = element.dataset.mediaId;
    if (!id || attached.has(element)) return;
    if (!measurements.has(id) && measurements.size >= 100) return;
    const measurement = measurements.get(id) || mediaMeasurement(id, record);
    measurements.set(id, measurement);
    attached.set(element, { ...attachMedia(element, measurement), id });
  }
  const observer = new MutationObserver(scan);
  if (root) observer.observe(root as Node, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-media-id", "data-media-provider"] });
  scan();
  return {
    snapshot() { attached.forEach(player => player.sample()); return [...measurements.values()].map(item => item.snapshot()); },
    exit() {
      attached.forEach(player => player.sample());
      measurements.forEach(measurement => measurement.exit());
    },
    restore() { measurements.forEach(measurement => measurement.restore()); },
    stop() { observer.disconnect(); attached.forEach(player => player.stop()); attached.clear(); },
  };
}
