import { providerAction } from "./media-actions";
import type { MediaMeasurement } from "./media-measurement";
import { playerScript } from "./player-scripts";
interface VimeoData { seconds?: number; duration?: number; playbackRate?: number; }
interface VimeoPlayer {
  on(event: string, listener: (data?: VimeoData) => void): void;
  off(event: string, listener: (data?: VimeoData) => void): void;
  ready(): Promise<void>;
}
const players = new WeakMap<HTMLIFrameElement, VimeoPlayer>();
export async function trackVimeo(frame: HTMLIFrameElement, measurement: MediaMeasurement, signal: AbortSignal) {
  const sdk = () => (window as unknown as { Vimeo?: { Player: new (frame: HTMLIFrameElement) => VimeoPlayer } }).Vimeo;
  await playerScript("https://player.vimeo.com/api/player.js", () => Boolean(sdk()));
  if (signal.aborted) return;
  const player = players.get(frame) || new (sdk()!.Player)(frame);
  players.set(frame, player);
  const tracking = measurement.player();
  const { observe, actions } = tracking;
  let position = 0, duration = 0, rate = 1;
  const state = { playing: false, seeking: false, buffering: false };
  const events = ["play", "playing", "pause", "bufferstart", "bufferend", "seeking", "seeked", "timeupdate", "ended", "playbackratechange"];
  const listeners = events.map(event => {
    const handler = (data?: VimeoData) => {
      if (signal.aborted) return;
      position = data?.seconds ?? position;
      duration = data?.duration ?? duration;
      const sample = () => observe({ position, duration, rate, playing: state.playing && !state.buffering, seeking: state.seeking, ended: event === "ended" }, performance.now());
      if (event === "seeking") state.seeking = true;
      sample();
      providerAction(actions, event, position);
      updateState(state, event);
      rate = data?.playbackRate ?? rate;
      sample();
    };
    player.on(event, handler);
    return () => player.off(event, handler);
  });
  signal.addEventListener("abort", () => { listeners.forEach(stop => stop()); tracking.stop(); }, { once: true });
  await player.ready();
  if (!signal.aborted) measurement.ready();
}
function updateState(state: { playing: boolean; seeking: boolean; buffering: boolean }, event: string) {
  if (event === "playing") state.playing = true;
  if (["pause", "ended"].includes(event)) state.playing = false;
  if (event === "bufferstart") state.buffering = true;
  if (event === "bufferend") state.buffering = false;
  if (event === "seeked") state.seeking = false;
}
