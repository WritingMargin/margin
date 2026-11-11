import assert from "node:assert/strict";
import test from "node:test";
import { attachStickyVideo, type StickyVideoState } from "./sticky-video";
import { getCompletions } from "./editor-completions";

class Media extends EventTarget { paused = true; ended = false; }
class Slot extends EventTarget {
  bottom = 500;
  focused = false;
  panel = {
    popover: false, open: false,
    setAttribute: () => { this.panel.popover = true; },
    removeAttribute: () => { this.panel.popover = false; },
    hasAttribute: () => this.panel.popover,
    showPopover: () => { this.panel.open = true; },
    hidePopover: () => { assert.equal(this.panel.popover, true); this.panel.open = false; },
  };
  style = { height: "", removeProperty: () => { this.style.height = ""; } };
  constructor(readonly media: Media | null) { super(); }
  getBoundingClientRect() { return { bottom: this.bottom, height: 240 }; }
  querySelector(selector: string) { return selector === "video" ? this.media : selector === ".sticky-video-player" ? this.panel : { focus: () => { this.focused = true; } }; }
  scrollIntoView() { this.bottom = 500; }
}
function environment() {
  const original = { document: globalThis.document, IntersectionObserver: globalThis.IntersectionObserver, ResizeObserver: globalThis.ResizeObserver };
  const callbacks: (() => void)[] = [];
  let disconnected = 0;
  const document = Object.assign(new EventTarget(), { fullscreenElement: null as object | null });
  Object.assign(globalThis, {
    document,
    IntersectionObserver: class { constructor(callback: () => void) { callbacks.push(callback); } observe() {} disconnect() { disconnected++; } },
    ResizeObserver: class { observe() {} disconnect() { disconnected++; } },
  });
  return { document, refresh: () => callbacks.forEach(callback => callback()), disconnected: () => disconnected, restore: () => Object.assign(globalThis, original) };
}
function player(media: Media | null) {
  const slot = new Slot(media);
  let state: StickyVideoState = { floating: false, pinned: false };
  const controls = attachStickyVideo(slot as unknown as HTMLElement, next => { state = next; });
  return { slot, controls, state: () => state };
}

test("native video docks only after playback and scrolling past, keeping its player and playback untouched", () => {
  const env = environment();
  try {
    const media = new Media();
    const p = player(media);
    p.slot.bottom = -1;
    env.refresh();
    assert.equal(p.state().floating, false);
    media.dispatchEvent(new Event("playing"));
    assert.equal(p.state().floating, true);
    assert.equal(p.slot.style.height, "240px");
    assert.equal(p.slot.panel.open, true, "top layer escapes article layout containment without replacing DOM");
    assert.equal(p.slot.media, media);
    media.dispatchEvent(new Event("pause"));
    env.refresh();
    assert.equal(p.state().floating, true, "pausing the floating player keeps its resume control accessible");
    p.slot.bottom = 400;
    env.refresh();
    assert.equal(p.state().floating, false);
    assert.equal(p.slot.style.height, "");
    assert.equal(p.slot.panel.popover, false);
    p.slot.bottom = -1;
    env.refresh();
    assert.equal(p.state().floating, false, "paused inline video does not auto-dock");
    p.controls.stop();
    media.dispatchEvent(new Event("playing"));
    assert.equal(p.state().floating, false);
    assert.equal(env.disconnected(), 2);
  } finally { env.restore(); }
});

test("hosted videos require explicit pin, fullscreen suspends floating, and returning keeps the same player", () => {
  const env = environment();
  try {
    const p = player(null);
    p.slot.bottom = -1;
    env.refresh();
    assert.equal(p.state().floating, false);
    p.controls.pin();
    assert.deepEqual(p.state(), { floating: true, pinned: true });
    env.document.fullscreenElement = {};
    env.document.dispatchEvent(new Event("fullscreenchange"));
    assert.equal(p.state().floating, false);
    env.document.fullscreenElement = null;
    env.document.dispatchEvent(new Event("fullscreenchange"));
    assert.equal(p.state().floating, true);
    p.controls.returnToVideo();
    assert.equal(p.state().floating, false);
    assert.equal(p.slot.focused, true);
    p.slot.bottom = -1;
    env.refresh();
    p.controls.dismiss();
    env.refresh();
    assert.deepEqual(p.state(), { floating: false, pinned: false });
    p.controls.stop();
  } finally { env.restore(); }
});

test("only one video floats at a time and later videos can still auto-dock; ending returns inline", () => {
  const env = environment();
  try {
    const first = player(new Media());
    const second = player(new Media());
    first.slot.bottom = -1;
    first.slot.media!.dispatchEvent(new Event("playing"));
    assert.equal(first.state().floating, true);
    second.slot.bottom = -1;
    second.slot.media!.dispatchEvent(new Event("playing"));
    assert.equal(first.state().floating, false);
    assert.equal(second.state().floating, true);
    second.slot.media!.dispatchEvent(new Event("ended"));
    env.refresh();
    assert.equal(second.state().floating, false);
    first.controls.stop();
    second.controls.stop();
  } finally { env.restore(); }
});

test("writer completions expose sticky as an explicit video opt-in", () => {
  const tag = "[Video ";
  assert.ok(getCompletions(tag, tag.length)!.items.some(item => item.label === "sticky"));
  const value = '[Video sticky="';
  assert.deepEqual(getCompletions(value, value.length)!.items.map(item => item.label), ["true", "false"]);
});
