import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { mediaMeasurement } from "./analytics/media-measurement";
import { mediaCollection, trustedPlayer } from "./analytics/player-scripts";
import { trackSoundCloud } from "./analytics/media-soundcloud";
import { trackNativeMedia } from "./analytics/media-native";
import { trackPageMedia } from "./analytics/media-tracker";
import { analyticsAllowed, trackPublicPage } from "./analytics/tracker";
import { analyticsDelivery, analyticsTransport } from "./analytics/transport";
import { mediaActions, providerAction, spotifyActionUpdates } from "./analytics/media-actions";
import type { AnalyticsBatch, AnalyticsMediaEvent } from "../shared/analytics";

const sample = (position: number, playing = true) => ({ position, duration: 10, playing });
test("playback counts actual elapsed time, excluding seeking, buffering and pauses", () => {
  const state = mediaMeasurement("clip"), observe = state.observer();
  observe(sample(0), 0);
  observe(sample(1), 1000);
  observe({ ...sample(8), seeking: true }, 1100);
  observe(sample(8), 1200);
  observe(sample(9), 2200);
  observe(sample(9, false), 2300);
  observe(sample(9, false), 4300);
  observe(sample(9), 4400);
  observe({ ...sample(10, false), ended: true }, 5400);
  assert.equal(state.snapshot().playedMs, 3000);
  assert.equal(state.snapshot().progress, 30);
  assert.equal(state.snapshot().completed, false);
});
test("replays add listening time but never double count timeline coverage", () => {
  const state = mediaMeasurement("clip"), observe = state.observer();
  for (let i = 0; i <= 10; i++) observe({ ...sample(i), ended: i === 10 }, i * 1000);
  observe(sample(0), 11000);
  observe(sample(1), 12000);
  assert.equal(state.snapshot().playedMs, 11000);
  assert.equal(state.snapshot().progress, 100);
  assert.equal(state.snapshot().completed, true);
});
test("speed affects timeline coverage while played time remains wall time", () => {
  const state = mediaMeasurement("clip"), observe = state.observer();
  observe({ ...sample(0), rate: 2 }, 0);
  observe({ ...sample(2), rate: 2 }, 1000);
  assert.equal(state.snapshot().playedMs, 1000);
  assert.equal(state.snapshot().progress, 20);
  observe(sample(9), 9000);
  assert.equal(state.snapshot().playedMs, 1000);
});
test("collections measure time without claiming completion or merging item progress", () => {
  const state = mediaMeasurement("collection"), observe = state.observer();
  observe({ ...sample(0), collection: true, entity: "one" }, 0);
  observe({ ...sample(1), collection: true, entity: "one" }, 1000);
  observe({ ...sample(9), collection: true, entity: "two" }, 2000);
  observe({ ...sample(10), collection: true, entity: "two", ended: true }, 3000);
  assert.equal(state.snapshot().playedMs, 2000);
  assert.equal(state.snapshot().progress, 0);
  assert.equal(state.snapshot().completed, false);
  assert.equal(mediaCollection({ src: "https://open.spotify.com/embed/playlist/abc" }, "spotify"), true);
  assert.equal(mediaCollection({ src: "https://open.spotify.com/embed/episode/abc" }, "spotify"), false);
  assert.equal(mediaCollection({ src: "https://w.soundcloud.com/player/?url=https://soundcloud.com/artist/sets/list" }, "soundcloud"), true);
});
test("only exact documented HTTPS player origins can access SDK adapters", () => {
  for (const src of ["https://open.spotify.com.evil.test/embed/track/a", "https://open.spotify.com:9000/embed/track/a", "http://open.spotify.com/embed/track/a", "javascript:alert(1)"]) assert.equal(trustedPlayer({ src }, "spotify"), false);
  assert.equal(trustedPlayer({ src: "https://open.spotify.com/embed/track/a" }, "spotify"), true);
  assert.equal(trustedPlayer({ src: "https://player.vimeo.com/video/1" }, "soundcloud"), false);
});
test("payloadless SoundCloud READY is safe and all callbacks detach on abort", async () => {
  const callbacks = new Map<string, (data?: { currentPosition: number }) => void>();
  const names = ["READY", "PLAY", "PAUSE", "PLAY_PROGRESS", "SEEK", "FINISH"];
  const widget = { bind: (name: string, fn: (data?: { currentPosition: number }) => void) => callbacks.set(name, fn), unbind: (name: string) => callbacks.delete(name), getDuration: (fn: (value: number) => void) => fn(10000) };
  const Widget = Object.assign(() => widget, { Events: Object.fromEntries(names.map(name => [name, name])) });
  const old = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { value: { SC: { Widget } }, configurable: true });
  try {
    const state = mediaMeasurement("sound"), controller = new AbortController();
    await trackSoundCloud({ src: "https://w.soundcloud.com/player/?url=https://soundcloud.com/artist/track" } as HTMLIFrameElement, state, controller.signal);
    callbacks.get("READY")!();
    assert.equal(state.snapshot().measurable, true);
    assert.equal(state.snapshot().started, false);
    callbacks.get("PLAY")!({ currentPosition: 0 });
    assert.equal(state.snapshot().started, true);
    controller.abort();
    assert.equal(callbacks.size, 0);
  } finally { if (old) Object.defineProperty(globalThis, "window", old); else Reflect.deleteProperty(globalThis, "window"); }
});
class FakeMedia extends EventTarget {
  currentTime = 0; duration = 10; playbackRate = 1; paused = true; ended = false; readyState = 4; seeking = false;
  emit(name: string) { this.dispatchEvent(new Event(name)); }
}
test("native listeners detach and stalled downloads do not stop buffered playback", () => {
  const element = new FakeMedia(), state = mediaMeasurement("native");
  const player = trackNativeMedia(element as unknown as HTMLMediaElement, state);
  element.paused = false; element.emit("playing");
  assert.equal(state.snapshot().started, true);
  player.stop();
  const before = state.snapshot();
  element.currentTime = 10; element.ended = true; element.emit("ended");
  assert.deepEqual(state.snapshot(), before);
});
test("late article media attaches once, removal detaches, cleanup disconnects observer", () => {
  let mutated = () => {}, disconnected = false;
  class Observer { constructor(callback: () => void) { mutated = callback; } observe() {} disconnect() { disconnected = true; } }
  const old = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", { value: Observer, configurable: true });
  const elements: unknown[] = [], media = new FakeMedia();
  const root = { querySelectorAll: () => elements };
  try {
    const tracker = trackPageMedia(root as unknown as ParentNode);
    assert.deepEqual(tracker.snapshot(), []);
    elements.push({ dataset: { mediaId: "late", mediaProvider: "native" }, querySelector: () => media });
    mutated(); mutated();
    assert.equal(tracker.snapshot().length, 1);
    elements.length = 0; mutated();
    media.paused = false; media.emit("playing");
    assert.equal(tracker.snapshot()[0].started, false);
    tracker.stop(); assert.equal(disconnected, true);
  } finally { if (old) Object.defineProperty(globalThis, "MutationObserver", old); else Reflect.deleteProperty(globalThis, "MutationObserver"); }
});
test("DNT, GPC and writer paths prevent tracking before player setup", () => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator"), loc = Object.getOwnPropertyDescriptor(globalThis, "location");
  try {
    for (const [doNotTrack, globalPrivacyControl, pathname] of [["1", false, "/"], ["0", true, "/"], ["0", false, "/admin/posts/test"]] as const) {
      Object.defineProperty(globalThis, "navigator", { value: { doNotTrack, globalPrivacyControl }, configurable: true });
      Object.defineProperty(globalThis, "location", { value: { pathname }, configurable: true });
      assert.equal(analyticsAllowed(), false);
      assert.doesNotThrow(() => trackPublicPage("post")());
    }
  } finally {
    if (nav) Object.defineProperty(globalThis, "navigator", nav); else Reflect.deleteProperty(globalThis, "navigator");
    if (loc) Object.defineProperty(globalThis, "location", loc); else Reflect.deleteProperty(globalThis, "location");
  }
});
test("media URLs/private tokens are excluded from generic click and selection collection", async () => {
  const tracker = await readFile(new URL("./analytics/tracker.ts", import.meta.url), "utf8");
  assert.match(tracker, /privateElements\s*=\s*"[^\"]*\[data-media-id\]/);
  assert.match(tracker, /node\.closest\(privateElements\)/);
  assert.match(tracker, /element\?\.closest\(privateElements\)/);
  const media = mediaMeasurement("opaque-id");
  const batch = { viewId: "view", sessionId: "session", postId: "post", revision: "rev", activeMs: 0, scrollDepth: 0, sections: [], events: [], media: [media.snapshot()] };
  assert.equal(analyticsDelivery(batch, []).body, analyticsDelivery(batch, []).body);
  assert.doesNotMatch(analyticsDelivery(batch, []).body, /https?:|src|url/);
});

test("native action history captures preplay seek and play request before listening starts", () => {
  const history: AnalyticsMediaEvent[] = [];
  const state = mediaMeasurement("native", event => history.push(event)), element = new FakeMedia();
  const tracking = trackNativeMedia(element as unknown as HTMLMediaElement, state);
  element.currentTime = 4.25; element.emit("seeked");
  element.emit("play");
  assert.deepEqual(history.map(event => [event.kind, event.positionMs]), [["seek", 4250], ["play", 4250]]);
  assert.equal(state.snapshot().started, false);
  assert.equal(state.snapshot().playedMs, 0);
  element.paused = false; element.emit("playing");
  element.emit("waiting"); element.emit("playing");
  assert.equal(history.length, 2, "buffering must not create a pause or resume");
  element.paused = true; element.emit("pause");
  element.paused = false; element.emit("play"); element.emit("playing");
  element.currentTime = 10; element.ended = true; element.emit("pause"); element.emit("ended"); element.emit("ended");
  assert.deepEqual(history.map(event => event.kind), ["seek", "play", "pause", "resume", "ended"]);
  assert.equal(state.snapshot().completed, false, "reaching end is an action, not proof of full listening");
  for (const event of history) {
    assert.match(event.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match(event.occurredAt, /^\d{4}-\d\d-\d\dT.*Z$/);
    assert.equal(event.mediaId, "native");
  }
  tracking.stop();
  element.emit("seeked"); assert.equal(history.length, 5);
});
test("provider action maps distinguish buffering and supported seeks from playback", () => {
  const history: AnalyticsMediaEvent[] = [], actions = mediaActions("provider", event => history.push(event));
  for (const [event, position] of [["seeked", 12], ["1", 12], ["3", 13], ["1", 13], ["2", 14], ["1", 14], ["0", 20], ["0", 20]] as const) providerAction(actions, event, position);
  assert.deepEqual(history.map(event => event.kind), ["seek", "play", "pause", "resume", "ended"]);
  assert.equal(history[0].positionMs, 12000);
  const more: AnalyticsMediaEvent[] = [], spotify = spotifyActionUpdates(mediaActions("spotify", event => more.push(event)));
  const base = { playingURI: "spotify:track:private-do-not-store", position: 0, duration: 10000, isPaused: false, isBuffering: false };
  spotify(base);
  spotify({ ...base, position: 1000, isBuffering: true });
  spotify({ ...base, position: 2000 });
  spotify({ ...base, position: 8000 }); // provider position jump is not a supported seek callback
  spotify({ ...base, position: 8000, isPaused: true });
  spotify({ ...base, position: 8000 });
  spotify({ ...base, position: 10000, isPaused: true });
  spotify({ ...base, position: 10000, isPaused: true });
  spotify({ ...base, playingURI: "spotify:track:next", position: 0 });
  assert.deepEqual(more.map(event => event.kind), ["play", "pause", "resume", "ended", "play"]);
  assert.doesNotMatch(JSON.stringify(more), /spotify:track|private-do-not-store/);
});
test("media history retries and beacon deliveries preserve event IDs and timestamps", async () => {
  const history: AnalyticsMediaEvent[] = [];
  mediaActions("opaque-id", event => history.push(event)).play(2.5);
  const original = globalThis.fetch, navigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const delivered: AnalyticsBatch[] = [], beacons: Blob[] = [];
  let attempts = 0;
  globalThis.fetch = async (_url, options) => {
    delivered.push(JSON.parse(String(options?.body)));
    if (++attempts === 1) throw new Error("offline");
    return new Response(null, { status: 204 });
  };
  Object.defineProperty(globalThis, "navigator", { value: { sendBeacon: (_url: string, body: Blob) => { beacons.push(body); return true; } }, configurable: true });
  try {
    const state = mediaMeasurement("opaque-id"); state.ready();
    const transport = analyticsTransport(() => ({ viewId: "view", sessionId: "session", postId: "post", revision: "rev", activeMs: 0, scrollDepth: 0, sections: [], events: [], media: [state.snapshot()] }));
    transport.addMedia(history[0]);
    await transport.send();
    transport.flush();
    await transport.send();
    await transport.send();
    assert.deepEqual(delivered[0].mediaEvents, history);
    assert.deepEqual(delivered[1].mediaEvents, history);
    assert.deepEqual(JSON.parse(await beacons[0].text()).mediaEvents, history);
    assert.deepEqual(delivered[2].mediaEvents, []);
  } finally {
    globalThis.fetch = original;
    if (navigator) Object.defineProperty(globalThis, "navigator", navigator); else Reflect.deleteProperty(globalThis, "navigator");
  }
});
test("combined history delivery bounds both queues and remains below 60KiB", () => {
  const mediaEvents: AnalyticsMediaEvent[] = [];
  const actions = mediaActions("a".repeat(16), event => mediaEvents.push(event));
  for (let i = 0; i < 100; i++) actions.seek(i);
  const batch: AnalyticsBatch = { viewId: "view", sessionId: "session", postId: "post", revision: "rev", activeMs: 0, scrollDepth: 0, sections: Array.from({ length: 100 }, (_, id) => ({ id: String(id), label: "界".repeat(100), activeMs: 0 })), events: [] };
  const pending = Array.from({ length: 100 }, (_, id) => ({ id: String(id), kind: "highlight" as const, sectionId: "section", target: "界".repeat(500) }));
  const delivery = analyticsDelivery(batch, pending, mediaEvents);
  assert.ok(delivery.events.length <= 30);
  assert.equal(delivery.mediaEvents.length, 30);
  assert.ok(new Blob([delivery.body]).size < 60000);
  assert.deepEqual(delivery.mediaEvents, mediaEvents.slice(0, 30));
});
