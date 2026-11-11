import { providerAction } from "./media-actions";
import type { MediaMeasurement } from "./media-measurement";
import { mediaCollection, playerScript } from "./player-scripts";
interface SCData { currentPosition?: number; }
interface SCWidget {
  bind(event: string, listener: (data?: SCData) => void): void;
  unbind(event: string): void;
  getDuration(callback: (duration: number) => void): void;
}
interface SoundCloud { Widget: ((frame: HTMLIFrameElement) => SCWidget) & { Events: Record<string, string> }; }
export async function trackSoundCloud(frame: HTMLIFrameElement, measurement: MediaMeasurement, signal: AbortSignal) {
  const sdk = () => (window as unknown as { SC?: SoundCloud }).SC;
  await playerScript("https://w.soundcloud.com/player/api.js", () => Boolean(sdk()));
  if (signal.aborted) return;
  const widget = sdk()!.Widget(frame), events = sdk()!.Widget.Events;
  const tracking = measurement.player();
  const { observe, actions } = tracking;
  const collection = mediaCollection(frame, "soundcloud");
  let duration = 0, playing = false, position = 0;
  const ready = () => widget.getDuration(value => { if (!signal.aborted) { duration = value / 1000; measurement.ready(); } });
  const names = ["READY", "PLAY", "PAUSE", "PLAY_PROGRESS", "SEEK", "FINISH"];
  function handle(name: string, data?: SCData) {
    if (signal.aborted) return;
    if (name === "READY") { ready(); return; }
    if (name === "PLAY") { ready(); playing = true; }
    if (typeof data?.currentPosition === "number") position = data.currentPosition / 1000;
    observe({ collection, position, duration, playing, seeking: name === "SEEK", ended: name === "FINISH" }, performance.now());
    providerAction(actions, name, position);
    if (name === "PAUSE" || name === "FINISH") playing = false;
    observe({ collection, position, duration, playing }, performance.now());
  }
  for (const name of names) widget.bind(events[name], data => handle(name, data));
  signal.addEventListener("abort", () => { names.forEach(name => widget.unbind(events[name])); tracking.stop(); }, { once: true });
  ready();
}
