import assert from "node:assert/strict";
import test from "node:test";
import { mediaMeasurement } from "./analytics/media-measurement";
import { trackPublicPage } from "./analytics/tracker";
import { trackNativeMedia } from "./analytics/media-native";
import type { AnalyticsBatch, AnalyticsMediaEvent } from "../shared/analytics";

test("replay bins measure overlap only, with wall time at playback speed", () => {
  const state = mediaMeasurement("recording"), observe = state.observer();
  const sample = (position: number, now: number) => observe({ position, duration: 20, rate: 2, playing: true }, now);
  sample(0, 0); sample(2, 1000); sample(4, 2000);
  sample(1, 2100); sample(3, 3100); sample(5, 4100);
  assert.equal(state.snapshot().playedMs, 4000);
  assert.equal(state.snapshot().progress, 25);
  assert.deepEqual(state.snapshot().replayMs, [0, 500, 500, 500, ...Array(16).fill(0)]);
  assert.deepEqual(state.snapshot(), state.snapshot(), "snapshots never increase replay counts");
  const snapshot = state.snapshot(); snapshot.replayMs![0] = 999;
  assert.equal(state.snapshot().replayMs![0], 0, "snapshots cannot mutate replay counters");
});

test("unknown, collection and changing timelines do not claim replay coverage", () => {
  for (const duration of [0, Infinity, NaN, -1, 86401]) {
    const state = mediaMeasurement("unknown");
    state.observer()({ position: 0, duration, playing: false }, 0);
    assert.equal(state.snapshot().replayMs, undefined);
  }
  const state = mediaMeasurement("changing"), observe = state.observer();
  observe({ position: 0, duration: 10, playing: true }, 0);
  assert.equal(state.snapshot().durationMs, 10000);
  observe({ position: 1, duration: 20, playing: true }, 1000);
  assert.equal(state.snapshot().replayMs, undefined);
  const collection = mediaMeasurement("collection");
  collection.observer()({ position: 0, duration: 10, playing: true, collection: true }, 0);
  assert.equal(collection.snapshot().replayMs, undefined);
});

test("duplicate players share replay counts but maintain independent play durations", () => {
  const events: AnalyticsMediaEvent[] = [];
  const state = mediaMeasurement("recording", event => events.push(event));
  const first = state.player(), second = state.player();
  first.actions.play(0);
  first.observe({ position: 0, duration: 10, playing: true }, 0);
  first.observe({ position: 2, duration: 10, playing: true }, 2000);
  first.actions.pause(2);
  second.actions.play(0);
  second.observe({ position: 0, duration: 10, playing: true }, 2000);
  second.observe({ position: 1, duration: 10, playing: true }, 3000);
  state.exit(); state.exit();
  assert.deepEqual(events.filter(event => event.playedMs !== undefined).map(event => [event.kind, event.playedMs]), [["pause", 2000], ["exit", 1000]]);
  assert.equal(state.snapshot().playedMs, 3000);
  assert.equal(state.snapshot().replayMs!.reduce((sum, ms) => sum + ms, 0), 1000);
  state.restore();
  second.observe({ position: 1, duration: 10, playing: true }, 100000);
  second.observe({ position: 2, duration: 10, playing: true }, 101000);
  state.exit();
  assert.equal(events.at(-1)?.playedMs, 1000, "BFCache restoration begins a new playback stint");
  first.stop(); second.stop();
});

class Player extends EventTarget {
  currentTime = 0; duration = 10; playbackRate = 1; paused = true; ended = false; readyState = 4; seeking = false;
  emit(name: string) { this.dispatchEvent(new Event(name)); }
}

test("late native attachment measures the first stop and respects paused BFCache restoration", context => {
  let now = 0;
  context.mock.method(performance, "now", () => now);
  const history: AnalyticsMediaEvent[] = [], element = new Player();
  element.paused = false;
  const state = mediaMeasurement("late", event => history.push(event));
  const tracking = trackNativeMedia(element as unknown as HTMLMediaElement, state);
  try {
    now = 1000; element.currentTime = 1; element.emit("timeupdate");
    state.exit();
    assert.deepEqual(history.map(event => [event.kind, event.playedMs]), [["exit", 1000]]);
    // Browsers may pause a cached video without delivering a pause callback.
    element.paused = true;
    state.restore(); state.exit();
    assert.equal(history.length, 1, "restoring paused media cannot create a false exit");
    element.paused = false; element.emit("play"); element.emit("playing");
    now = 2000; element.currentTime = 2; element.emit("timeupdate");
    element.paused = true; element.emit("pause");
    assert.deepEqual(history.map(event => [event.kind, event.playedMs]), [["exit", 1000], ["resume", undefined], ["pause", 1000]]);
  } finally { tracking.stop(); }
});

for (const page of ["article", "homepage"]) test(`${page} lifecycle delivers final audio/video durations without counting tab hiding as exit`, async context => {
  let now = 0;
  context.mock.method(performance, "now", () => now);
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const install = (key: string, value: unknown) => { saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }); };
  const players = [new Player(), new Player()];
  const windows = Object.assign(new EventTarget(), { setInterval: () => 1, clearInterval() {}, clearTimeout() {}, getSelection: () => null });
  const doc = Object.assign(new EventTarget(), {
    visibilityState: "visible", hasFocus: () => true, querySelector: () => null,
    documentElement: { getBoundingClientRect: () => ({ top: 0, height: 1000 }) },
    querySelectorAll: () => players.map((player, index) => ({ dataset: { mediaId: String(index), mediaProvider: "native" }, querySelector: () => player })),
  });
  const beacons: Blob[] = [];
  install("window", windows); install("document", doc); install("location", { pathname: page === "article" ? "/post/playback" : "/" }); install("innerHeight", 800);
  install("navigator", { sendBeacon: (_url: string, blob: Blob) => { beacons.push(blob); return true; } });
  install("MutationObserver", class { observe() {} disconnect() {} });
  context.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  try {
    const stop = page === "article" ? trackPublicPage("post", "revision") : trackPublicPage();
    try {
      players.forEach(player => { player.paused = false; player.emit("play"); player.emit("playing"); });
      now = 1000; players.forEach(player => { player.currentTime = 1; player.emit("timeupdate"); });
      doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
      const hidden = JSON.parse(await beacons.at(-1)!.text()) as AnalyticsBatch;
      assert.equal(hidden.postId, page === "article" ? "post" : "");
      assert.equal(hidden.mediaEvents?.some(event => event.kind === "exit"), false);
      now = 2000; players.forEach(player => { player.currentTime = 2; });
      windows.dispatchEvent(new Event("pagehide"));
      const left = JSON.parse(await beacons.at(-1)!.text()) as AnalyticsBatch;
      assert.deepEqual(left.mediaEvents?.filter(event => event.kind === "exit").map(event => event.playedMs), [2000, 2000]);
      assert.deepEqual(left.media?.map(media => media.playedMs), [2000, 2000]);
      now = 100000; windows.dispatchEvent(new Event("pageshow"));
      players.forEach(player => player.emit("playing"));
      now = 101000; players.forEach(player => { player.currentTime = 3; });
      windows.dispatchEvent(new Event("pagehide"));
      const restored = JSON.parse(await beacons.at(-1)!.text()) as AnalyticsBatch;
      assert.deepEqual(restored.mediaEvents?.filter(event => event.kind === "exit").map(event => event.playedMs), [2000, 2000, 1000, 1000]);
      stop();
      const cleaned = JSON.parse(await beacons.at(-1)!.text()) as AnalyticsBatch;
      assert.deepEqual(cleaned.mediaEvents, restored.mediaEvents, "cleanup resends stable event IDs, not duplicate exits");
    } finally { stop(); }
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
