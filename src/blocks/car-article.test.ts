import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseBlock } from "./schema";
import { inspectModelBuffer } from "./scene-model-format";
const base = new URL("../../examples/car-atlas/", import.meta.url);
const content = readFileSync(new URL("article.md", base), "utf8");

test("car article exercises imported geometry, six selectable assemblies and a continuous power route", () => {
  const scenes = [
    ...content.matchAll(/\[Scene[^\]]*\]\n([\s\S]*?)\n\[\/Scene\]/g),
  ].map((match) => parseBlock("scene", match[1]));
  assert.equal(scenes.length, 2);
  for (const scene of scenes) {
    assert.equal(scene.kind, "scene");
    if (scene.kind !== "scene") return;
    for (const object of scene.spec.objects) {
      assert.equal(object.shape, "model");
      assert.ok(object.description);
      assert.equal(
        object.pulse,
        undefined,
        "Cars must not inherit the heart pulse",
      );
      const bytes = readFileSync(
        new URL(object.src!.replace("/assets/", "assets/"), base),
      );
      const model = inspectModelBuffer(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
      assert.ok(model.meshes.length > 0);
      assert.ok(model.nodes.every((node: { name?: string }) => node.name));
      assert.ok(
        model.accessors
          .filter((accessor: { type: string }) => accessor.type === "VEC3")
          .some((accessor: { min?: number[]; max?: number[] }) =>
            accessor.min?.every(
              (min, i) => Number.isFinite(min) && accessor.max![i] > min,
            ),
          ),
        "Model needs three-dimensional bounds",
      );
    }
  }
  if (scenes[1].kind !== "scene") return;
  assert.equal(scenes[1].spec.objects.length, 6);
  const source = content
    .split("[Illustration]\n")[1]
    .split("\n[/Illustration]")[0];
  assert.deepEqual(
    JSON.parse(source),
    JSON.parse(readFileSync(new URL("power-flow.json", base), "utf8")),
  );
  const atlas = parseBlock("illustration", source);
  if (atlas.kind !== "illustration") throw new Error("Expected atlas");
  assert.equal(atlas.spec.regions.length, 5);
  assert.equal(atlas.spec.flow?.steps.length, 4);
});

test("scene object explanations stay bounded and cannot introduce executable properties", () => {
  const spec = {
    title: "Car",
    objects: [
      { shape: "box", label: "Battery", description: "Stores energy." },
    ],
  };
  assert.doesNotThrow(() => parseBlock("scene", JSON.stringify(spec)));
  for (const object of [
    { ...spec.objects[0], description: "a".repeat(2001) },
    { ...spec.objects[0], onClick: "alert(1)" },
  ])
    assert.throws(() =>
      parseBlock("scene", JSON.stringify({ ...spec, objects: [object] })),
    );
});
