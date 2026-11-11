const bins = 20;
type Range = [number, number];

/** Replay is overlap with portions already played during this page visit. */
export function mediaReplay() {
  let durationMs = 0, unavailable = false;
  const replay = Array<number>(bins).fill(0);
  function duration(seconds: number, collection = false) {
    if (collection) unavailable = true;
    const ms = Math.round(seconds * 1000);
    if (!Number.isFinite(ms) || ms <= 0 || ms > 86_400_000) return;
    // A changing/live timeline cannot reliably label replayed sections.
    if (durationMs && Math.abs(ms - durationMs) > Math.max(1000, durationMs * 0.01)) unavailable = true;
    if (!durationMs) durationMs = ms;
  }
  return {
    duration,
    add(start: number, end: number, elapsed: number, previous: Range[]) {
      if (!durationMs || unavailable || end <= start) return;
      const width = durationMs / 1000 / bins;
      for (let index = 0; index < bins; index++) {
        for (const [from, to] of previous) {
          const overlap = Math.max(0, Math.min(end, to, (index + 1) * width) - Math.max(start, from, index * width));
          replay[index] += elapsed * overlap / (end - start);
        }
      }
    },
    snapshot() {
      return durationMs && !unavailable ? { durationMs, replayMs: replay.map(ms => Math.floor(ms)) } : {};
    },
  };
}
