import assert from "node:assert/strict";
import test from "node:test";
import { trackPageMedia } from "./analytics/media-tracker";
import type { AnalyticsMediaEvent } from "../shared/analytics";

class Player extends EventTarget {
  currentTime = 0; duration = 10; playbackRate = 1; paused = true; ended = false; readyState = 4; seeking = false;
  emit(name: string) { this.dispatchEvent(new Event(name)); }
}

test("article audio and video have matching playback metrics and timestamped actions", context => {
  let now = 0;
  context.mock.method(performance, "now", () => now);
  const observer = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", { configurable: true, value: class { observe() {} disconnect() {} } });
  const history: AnalyticsMediaEvent[] = [];
  const players = [new Player(), new Player()];
  const elements = ["audio", "video"].map((tag, index) => ({
    dataset: { mediaId: tag, mediaProvider: "native" },
    querySelector: (selector: string) => selector.split(",").includes(tag) ? players[index] : null,
  }));
  const root = { querySelectorAll: () => elements };
  const perform = (at: number, action: (player: Player) => void) => { now = at; players.forEach(action); };
  try {
    const tracking = trackPageMedia(root as unknown as ParentNode, event => history.push(event));
    try {
      perform(0, player => { player.paused = false; player.emit("play"); player.emit("playing"); });
      perform(1000, player => { player.currentTime = 1; player.emit("timeupdate"); player.paused = true; player.emit("pause"); });
      perform(3000, player => { player.paused = false; player.emit("play"); player.emit("playing"); player.currentTime = 0; player.emit("seeked"); });
      perform(4000, player => { player.currentTime = 1; player.emit("timeupdate"); player.emit("waiting"); });
      perform(6000, player => player.emit("playing"));
      perform(7000, player => { player.currentTime = 2; player.emit("timeupdate"); });
      perform(8000, player => { player.seeking = true; player.emit("seeking"); player.currentTime = 9; player.seeking = false; player.emit("seeked"); });
      perform(9000, player => { player.currentTime = 10; player.ended = true; player.paused = true; player.emit("pause"); player.emit("ended"); });
      for (const state of tracking.snapshot()) {
        assert.deepEqual(state, { id: state.id, started: true, playedMs: 4000, progress: 30, completed: false, measurable: true, durationMs: 10000, replayMs: [500, 500, ...Array(18).fill(0)] });
      }
      for (const id of ["audio", "video"]) {
        const events = history.filter(event => event.mediaId === id);
        assert.deepEqual(events.map(event => [event.kind, event.positionMs]), [["play", 0], ["pause", 1000], ["resume", 1000], ["seek", 0], ["seek", 9000], ["ended", 10000]]);
        assert.deepEqual(events.filter(event => event.playedMs !== undefined).map(event => event.playedMs), [1000, 3000]);
        for (const event of events) assert.ok(Number.isFinite(Date.parse(event.occurredAt)));
      }
      assert.equal(new Set(history.map(event => event.id)).size, 12);
      perform(10000, player => { player.currentTime = 0; player.ended = false; player.paused = false; player.emit("seeked"); player.emit("play"); player.emit("playing"); });
      for (let second = 1; second <= 10; second++) perform(10000 + second * 1000, player => { player.currentTime = second; player.emit("timeupdate"); });
      perform(20000, player => { player.ended = true; player.emit("ended"); });
      assert.equal(tracking.snapshot().length, 2);
      for (const state of tracking.snapshot()) {
        assert.deepEqual(state, { id: state.id, started: true, playedMs: 14000, progress: 100, completed: true, measurable: true, durationMs: 10000, replayMs: [1000, 1000, 500, 500, ...Array(14).fill(0), 500, 500] });
      }
    } finally { tracking.stop(); }
    const count = history.length;
    players.forEach(player => player.emit("seeked"));
    assert.equal(history.length, count, "both players detach on article exit");
  } finally {
    if (observer) Object.defineProperty(globalThis, "MutationObserver", observer);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
