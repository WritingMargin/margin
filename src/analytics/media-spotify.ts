import { spotifyActionUpdates } from "./media-actions";
import type { MediaMeasurement } from "./media-measurement";
import { mediaCollection, playerScript } from "./player-scripts";
interface SpotifyData { playingURI?: string; position: number; duration: number; isPaused: boolean; isBuffering: boolean; }
interface SpotifyController {
  addListener(event: string, callback: (event: { data: SpotifyData }) => void): void;
  destroy(): void;
}
interface SpotifyAPI {
  createController(element: HTMLElement, options: { url: string; width: string; height: string }, callback: (controller: SpotifyController) => void): void;
}
let spotifyAPI: SpotifyAPI | undefined;
let callbackInstalled = false;
function spotifyReady() {
  if (callbackInstalled) return;
  callbackInstalled = true;
  const globals = window as unknown as { onSpotifyIframeApiReady?: (api: SpotifyAPI) => void };
  const previous = globals.onSpotifyIframeApiReady;
  globals.onSpotifyIframeApiReady = api => { spotifyAPI = api; previous?.(api); };
}
export async function trackSpotify(frame: HTMLIFrameElement, measurement: MediaMeasurement, signal: AbortSignal) {
  if (!spotifyAPI) spotifyReady();
  await playerScript("https://open.spotify.com/embed/iframe-api/v1", () => Boolean(spotifyAPI));
  if (signal.aborted || !frame.parentElement) return;
  // The API replaces its target. Keep that DOM outside React's child ownership;
  // the original iframe stays available if the SDK fails or analytics stops.
  const slot = document.createElement("div");
  const target = document.createElement("div");
  slot.append(target);
  slot.hidden = true;
  frame.after(slot);
  const tracking = measurement.player();
  const { observe, actions } = tracking;
  const actionUpdate = spotifyActionUpdates(actions);
  const collection = mediaCollection(frame, "spotify");
  let controller: SpotifyController | undefined;
  const originalDisplay = frame.style.display;
  const cleanup = () => { controller?.destroy(); slot.remove(); frame.style.display = originalDisplay; tracking.stop(); };
  signal.addEventListener("abort", cleanup, { once: true });
  spotifyAPI!.createController(target, { url: frame.src.replace("/embed/", "/"), width: "100%", height: frame.height || "352" }, player => {
    controller = player;
    if (signal.aborted) { cleanup(); return; }
    player.addListener("ready", () => {
      if (signal.aborted) return;
      frame.style.display = "none";
      const iframe = slot.querySelector("iframe");
      if (iframe) iframe.title = frame.title;
      slot.hidden = false;
      measurement.ready();
    });
    player.addListener("playback_update", event => {
      if (signal.aborted) return;
      const data = event.data;
      observe({ collection, entity: data.playingURI, position: data.position / 1000, duration: data.duration / 1000, playing: !data.isPaused && !data.isBuffering, ended: data.duration > 0 && data.position >= data.duration }, performance.now());
      actionUpdate(data);
    });
  });
}
