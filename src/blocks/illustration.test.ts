import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseBlock } from "./schema";
import { illustrationSchema } from "./illustration-schema";
const heart = JSON.parse(
  readFileSync(
    new URL("../../examples/heart-atlas/heart.json", import.meta.url),
    "utf8",
  ),
);

test("heart article carries the complete validated illustration and explicit poster", () => {
  const content = readFileSync(
    new URL("../../examples/heart-atlas/article.md", import.meta.url),
    "utf8",
  );
  const payload = content
    .split("[Illustration]\n")[1]
    .split("\n[/Illustration]")[0];
  assert.deepEqual(JSON.parse(payload), heart);
  const parsed = parseBlock("illustration", payload);
  assert.equal(parsed.kind, "illustration");
  assert.equal(illustrationSchema.parse(heart).regions.length, 13);
});

test("illustrations reject scripts, remote paints, unknown properties and dangling regions", () => {
  const changedShape = (change: object) => ({
    ...heart,
    shapes: [{ ...heart.shapes[0], ...change }],
  });
  for (const value of [
    changedShape({ path: '<svg onload="alert(1)">' }),
    changedShape({ fill: "url(https://example.com/tracker)" }),
    changedShape({ onClick: "alert(1)" }),
    changedShape({ region: "nonexistent" }),
    { ...heart, regions: [heart.regions[0], heart.regions[0]] },
    { ...heart, regions: [{ ...heart.regions[0], x: 900 }] },
    { ...heart, shapes: Array(101).fill(heart.shapes[0]) },
  ])
    assert.throws(() => parseBlock("illustration", JSON.stringify(value)));
});

test("static posters accept hosted images and reject executable or ambiguous URLs", () => {
  for (const kind of ["illustration", "scene"] as const) {
    const spec =
      kind === "illustration"
        ? heart
        : { title: "Heart", objects: [{ shape: "sphere", label: "Heart" }] };
    for (const src of [
      "/assets/poster.jpg",
      "https://example.test/poster.png",
    ]) {
      assert.doesNotThrow(() =>
        parseBlock(
          kind,
          JSON.stringify({
            ...spec,
            poster: { src, alt: "Static heart view" },
          }),
        ),
      );
    }
    for (const src of [
      "javascript:alert(1)",
      "//example.test/a.png",
      "/\\\\example.test/a.png",
      "data:image/svg+xml,bad",
      "https://user:password@example.test/a.png",
    ]) {
      assert.throws(() =>
        parseBlock(
          kind,
          JSON.stringify({ ...spec, poster: { src, alt: "Static view" } }),
        ),
      );
    }
    assert.throws(() =>
      parseBlock(
        kind,
        JSON.stringify({ ...spec, poster: { src: "/poster.jpg", alt: "" } }),
      ),
    );
  }
});
