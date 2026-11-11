import assert from "node:assert/strict";
import test from "node:test";
import { initialMediaDefaults, mediaDefaultTag, newMediaTag, parseMediaDefaultTag } from "../shared/media-defaults";
import { applyCompletion, getCompletions, mediaCompletion } from "./editor-completions";

test("layout tags round-trip and reject per-item content", () => {
  for (const kind of ["image", "video"] as const) {
    assert.deepEqual(parseMediaDefaultTag(kind, mediaDefaultTag(kind, initialMediaDefaults[kind])), initialMediaDefaults[kind]);
  }
  assert.deepEqual(parseMediaDefaultTag("image", '[Image width="small"]'), { frame: "auto", width: "small", align: "center" });
  for (const text of ['[Image src="https://example.com/private.png"]', '[Image caption="Private caption"]', '[Video frame="plain"]', '[Image width="invalid"]', '[Image]\n[Image]', '[/Image]', '[Image']) {
    assert.throws(() => parseMediaDefaultTag("image", text));
  }
});

test("new media and writer commands apply saved defaults without rewriting existing content", () => {
  const defaults = structuredClone(initialMediaDefaults);
  defaults.image = { frame: "polaroid", width: "small", align: "right" };
  assert.equal(newMediaTag("image", "/api/public/covers/example", defaults), '[Image src="/api/public/covers/example" frame="polaroid" width="small" align="right"]');
  const existing = '[Image src="https://example.com/old.png" frame="plain"]';
  const text = existing + '\n\n/ima';
  const context = getCompletions(text, text.length)!;
  const image = context.items.find(item => item.id === "image")!;
  const result = applyCompletion(text, context, mediaCompletion(image, defaults));
  assert.ok(result.content.startsWith(existing + '\n\n'));
  assert.ok(result.content.includes('frame="polaroid" width="small" align="right"'));
  assert.equal(result.content.slice(result.start, result.end), "https://example.com/image.jpg");
  const carousel = getCompletions('/carousel', 9)!.items.find(item => item.id === "carousel")!;
  assert.equal(mediaCompletion(carousel, defaults), carousel, "carousels remain writer tags");
});
