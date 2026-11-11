import type { MediaMeasurement } from "./media-measurement";

export function trackNativeMedia(element: HTMLMediaElement, measurement: MediaMeasurement) {
  const player = measurement.player(() => !element.paused && !element.ended);
  const { observe, actions } = player;
  const listeners = new AbortController();
  let playing = !element.paused && !element.ended && element.readyState >= 3;
  if (playing) actions.attachPlaying();
  function sample() {
    observe({ position: element.currentTime, duration: element.duration, rate: element.playbackRate, playing, seeking: element.seeking, ended: element.ended }, performance.now());
  }
  const handlers: Record<string, () => void> = {
    play() { measurement.ready(); actions.play(element.currentTime); },
    playing() { playing = true; sample(); },
    pause() { sample(); playing = false; sample(); if (!element.ended) actions.pause(element.currentTime); },
    waiting() { sample(); playing = false; sample(); },
    stalled() { if (element.readyState < 3) { sample(); playing = false; sample(); } },
    ended() { sample(); playing = false; sample(); actions.ended(element.currentTime); },
    seeking: sample,
    seeked() { sample(); actions.seek(element.currentTime); },
    timeupdate: sample,
    ratechange: sample,
    loadedmetadata() { measurement.ready(); sample(); },
  };
  for (const [event, handler] of Object.entries(handlers)) element.addEventListener(event, handler, { signal: listeners.signal });
  // A native player is measurable even before a lazy file has downloaded.
  measurement.ready();
  sample();
  return { sample, stop() { sample(); listeners.abort(); player.stop(); } };
}
