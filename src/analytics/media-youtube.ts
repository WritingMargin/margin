import { providerAction } from "./media-actions";
import type { MediaMeasurement } from "./media-measurement";
import { playerScript } from "./player-scripts";
interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  getPlayerState(): number;
  addEventListener(event: string, listener: () => void): void;
  removeEventListener(event: string, listener: () => void): void;
}
interface YouTubeSDK { Player: new (frame: HTMLIFrameElement) => YouTubePlayer; }
const players = new WeakMap<HTMLIFrameElement, YouTubePlayer>();
export async function trackYouTube(frame: HTMLIFrameElement, measurement: MediaMeasurement, signal: AbortSignal) {
  const sdk = () => (window as unknown as { YT?: YouTubeSDK }).YT;
  await playerScript("https://www.youtube.com/iframe_api", () => Boolean(sdk()?.Player));
  if (signal.aborted) return;
  const source = new URL(frame.src);
  source.searchParams.set("enablejsapi", "1");
  source.searchParams.set("origin", location.origin);
  if (frame.src !== source.href) frame.src = source.href;
  const player = players.get(frame) || new (sdk()!.Player)(frame);
  players.set(frame, player);
  const tracking = measurement.player();
  const { observe, actions } = tracking;
  function sample() {
    if (signal.aborted || !player.getCurrentTime) return;
    const state = player.getPlayerState();
    observe({ position: player.getCurrentTime(), duration: player.getDuration(), rate: player.getPlaybackRate(), playing: state === 1, ended: state === 0 }, performance.now());
  }
  const changed = () => {
    if (signal.aborted || !player.getCurrentTime) return;
    sample();
    providerAction(actions, String(player.getPlayerState()), player.getCurrentTime());
  };
  const ready = () => { measurement.ready(); sample(); };
  player.addEventListener("onReady", ready);
  player.addEventListener("onStateChange", changed);
  const clock = window.setInterval(sample, 500);
  signal.addEventListener("abort", () => {
    window.clearInterval(clock);
    player.removeEventListener("onReady", ready);
    player.removeEventListener("onStateChange", changed);
    tracking.stop();
  }, { once: true });
}
