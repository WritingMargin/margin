import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClip, Object3D, VectorKeyframeTrack } from "three";
import { parseClipJSON } from "./scene-clip-json";
import { SceneClips } from "./scene-clips";
import { parseSceneModel, disposeSceneObject } from "./scene-model";

test("clips with duplicate names bind to their own model and pause without advancing", () => {
  const clips = new SceneClips();
  const clip = new AnimationClip("Open", 1, [
    new VectorKeyframeTrack(".position", [0, 1], [0, 0, 0, 1, 0, 0]),
  ]);
  const a = new Object3D(),
    b = new Object3D();
  clips.add(1, b, [clip], "Second");
  const options = clips.add(0, a, [clip], "First");
  assert.deepEqual(
    options.map((option) => option.id),
    ["0/0", "1/0"],
  );
  clips.select("0/0");
  clips.update(0.1);
  assert.equal(a.position.x, 0);
  clips.playing = true;
  clips.update(0.5);
  assert.equal(a.position.x, 0.5);
  clips.playing = false;
  clips.update(0.2);
  assert.equal(a.position.x, 0.5);
  clips.select("1/0");
  clips.playing = true;
  clips.update(0.25);
  assert.equal(b.position.x, 0.25);
  assert.equal(a.position.x, 0);
  clips.dispose();
});
test("OBJ, binary STL and ASCII STL import and fit geometry", async () => {
  const bytes = new ArrayBuffer(134);
  const view = new DataView(bytes);
  view.setUint32(80, 1, true);
  view.setFloat32(108, 1, true);
  view.setFloat32(124, 1, true);
  for (const [format, data] of [
    [
      "obj",
      new TextEncoder().encode("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n").buffer,
    ],
    ["stl", bytes],
    [
      "stl",
      new TextEncoder().encode(
        "solid part\nfacet normal 0 0 1\n outer loop\n vertex 0 0 0\n vertex 1 0 0\n vertex 0 1 0\n endloop\nendfacet\nendsolid part",
      ).buffer,
    ],
  ] as const) {
    const model = await parseSceneModel(data, format);
    assert.equal(model.group.scale.x, 2.6);
    assert.equal(model.animations.length, 0);
    disposeSceneObject(model.group);
  }
  view.setUint32(80, 0xffffffff, true);
  await assert.rejects(parseSceneModel(bytes, "stl"), /facet count/);
});

test("native Three.js transform JSON binds by model node name and rejects other properties", () => {
  const model = new Object3D(),
    arm = new Object3D();
  arm.name = "Arm";
  model.add(arm);
  const source = new AnimationClip("Lift", 1, [
    new VectorKeyframeTrack("Arm.position", [0, 1], [0, 0, 0, 0, 2, 0]),
  ]).toJSON();
  const read = () =>
    parseClipJSON(
      new TextEncoder().encode(JSON.stringify(source)).buffer,
      model,
    );
  const playback = new SceneClips();
  playback.add(0, model, [read()], "Crane");
  playback.select("0/0");
  playback.playing = true;
  playback.update(0.5);
  assert.equal(arm.position.y, 1);
  for (const invalid of [
    "Unknown.position",
    "Arm.material.color",
    "Arm.position[__proto__]",
  ]) {
    source.tracks[0].name = invalid;
    assert.throws(read);
  }
  playback.dispose();
});
