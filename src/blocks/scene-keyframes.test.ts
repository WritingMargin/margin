import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group, Mesh } from "three";
import { sceneSchema } from "./schema";
import { animatedObjectBounds, sceneAnimation } from "./scene-keyframes";
import { SceneClips } from "./scene-clips";

const wheel = {
  shape: "torus",
  label: "Wheel",
  keyframes: [
    { time: 1, rotation: [0, 0, Math.PI * 2] },
    { time: 2, position: [4, 0, 0] },
  ],
};
test("copied scene motion shares one clock and holds independently keyed transforms", () => {
  const spec = sceneSchema.parse({
    title: "Drive",
    objects: [
      wheel,
      {
        shape: "box",
        label: "Car",
        keyframes: [{ time: 2, position: [0, 4, 0] }],
      },
    ],
  });
  const root = new Group(),
    objects = spec.objects.map(() => new Mesh(new BoxGeometry()));
  root.add(...objects);
  const clip = sceneAnimation(spec.objects, objects)!;
  const clips = new SceneClips();
  clips.add(-1, root, [clip], spec.title);
  clips.select("-1/0");
  clips.update(0.5);
  assert.equal(objects[0].rotation.z, 0);
  clips.playing = true;
  clips.update(0.5);
  assert.ok(Math.abs(objects[0].rotation.z - Math.PI) < 1e-6);
  assert.equal(objects[0].position.x, 1);
  assert.equal(objects[1].position.y, 1);
  clips.update(1);
  assert.ok(Math.abs(objects[0].rotation.z - 2 * Math.PI) < 1e-6);
  const bounds = animatedObjectBounds(objects[0], spec.objects[0]);
  assert.ok(bounds.min.x < 0 && bounds.max.x > 4);
  clips.update(0.5);
  assert.equal(objects[0].position.x, 0);
  clips.dispose();
});
test("invalid keyframes fail the same validation used by chat and articles", () => {
  for (const keyframes of [
    [],
    [{ time: 1 }],
    [{ time: 0, position: [0, 0, 0] }],
    [{ time: 121, rotation: [0, 0, 1] }],
    [wheel.keyframes[1], wheel.keyframes[0]],
    [{ time: 1, position: [0, 0, 100] }],
    Array(33).fill(wheel.keyframes[0]),
  ]) {
    assert.equal(
      sceneSchema.safeParse({
        title: "Invalid",
        objects: [{ ...wheel, keyframes }],
      }).success,
      false,
    );
  }
});
