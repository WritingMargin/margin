import { mediaActions, type MediaEventSink } from "./media-actions";
import { mediaReplay } from "./media-replay";
import type { AnalyticsMedia } from "../../shared/analytics";

export interface PlaybackSample {
  position: number;
  duration: number;
  playing: boolean;
  seeking?: boolean;
  ended?: boolean;
  rate?: number;
  entity?: string;
  collection?: boolean;
}
export function mediaMeasurement(id: string, record: MediaEventSink = () => {}) {
  const value: AnalyticsMedia = { id, started: false, playedMs: 0, progress: 0, completed: false, measurable: false };
  let ranges: [number, number][] = [];
  const replay = mediaReplay();
  const players = new Set<{ exit(): void; restore(): void }>();
  function addRange(start: number, end: number, duration: number) {
    ranges.push([start, end]);
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const range of ranges) {
      const last = merged.at(-1);
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
    }
    ranges = merged;
    if (duration > 0) value.progress = Math.max(value.progress, Math.min(100, Math.floor(ranges.reduce((sum, [a, b]) => sum + b - a, 0) / duration * 100)));
  }
  // Each element has its own clock; duplicate embeds share the cumulative result.
  function observer(listened: (elapsed: number) => void = () => {}) {
    let previous: (PlaybackSample & { now: number }) | undefined;
    const observe = (sample: PlaybackSample, now: number) => {
      if (!Number.isFinite(sample.position) || sample.position < 0) return;
      value.measurable = true;
      replay.duration(sample.duration, sample.collection);
      if (playbackStarted(sample)) value.started = true;
      if (previous?.entity !== sample.entity) previous = undefined;
      const elapsed = playedInterval(previous, sample, now);
      if (elapsed > 0 && previous) {
        const credited = Math.min(elapsed, 86_400_000 - value.playedMs);
        value.playedMs += credited;
        listened(credited);
        if (!sample.collection) {
          replay.add(previous.position, sample.position, credited, ranges);
          addRange(previous.position, sample.position, sample.duration);
        }
      }
      if (playbackCompleted(sample, value.progress)) value.completed = true;
      previous = { ...sample, now };
    };
    return Object.assign(observe, { reset() { previous = undefined; } });
  }
  return {
    actions: () => mediaActions(id, record),
    snapshot: () => ({ ...value, playedMs: Math.floor(value.playedMs), ...replay.snapshot() }),
    ready() { value.measurable = true; },
    observer,
    player(isPlaying?: () => boolean) {
      const actions = mediaActions(id, record), observe = observer(actions.listen);
      let position = 0;
      const player = {
        exit() { actions.exit(position); observe.reset(); },
        restore() { actions.restore(isPlaying?.()); observe.reset(); },
      };
      players.add(player);
      return {
        actions,
        observe(sample: PlaybackSample, now: number) { position = sample.position; observe(sample, now); },
        stop() { players.delete(player); },
      };
    },
    exit() { players.forEach(player => player.exit()); },
    restore() { players.forEach(player => player.restore()); },
  };
}
function playedInterval(previous: (PlaybackSample & { now: number }) | undefined, sample: PlaybackSample, now: number) {
  if (!previous?.playing || previous.seeking || sample.seeking) return 0;
  const elapsed = now - previous.now;
  const advance = sample.position - previous.position;
  const rate = Math.max(0.25, Math.min(16, previous.rate || 1));
  // Forward/backward seeks and long gaps cannot establish continuous playback.
  if (elapsed <= 0 || elapsed > 5000 || advance <= 0 || advance > elapsed / 1000 * rate + 0.75) return 0;
  return Math.min(elapsed, advance / rate * 1000);
}
export type MediaMeasurement = ReturnType<typeof mediaMeasurement>;
export type PlaybackObserver = ReturnType<MediaMeasurement["observer"]>;

function playbackStarted(sample: PlaybackSample) { return sample.playing && !sample.seeking; }
function playbackCompleted(sample: PlaybackSample, progress: number) { return !sample.collection && sample.ended && progress >= 90; }
