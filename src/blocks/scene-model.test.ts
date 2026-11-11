import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parseBlock } from "./schema";
import {
  inspectModelBuffer,
  safeModelUrl,
  inspectGltfJSON,
} from "./scene-model-format";
import { pulseScale } from "./scene-motion";
function glb(json: object) {
  const text = new TextEncoder().encode(
    JSON.stringify({ asset: { version: "2.0" }, ...json }),
  );
  const length = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(20 + length),
    view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, length, true);
  view.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(buffer, 20);
  bytes.fill(32);
  bytes.set(text);
  return buffer;
}
test("the shipped heart is a real, embedded GLB mesh accepted by the model loader", () => {
  const bytes = readFileSync(
    new URL("../../examples/heart-atlas/assets/heart.glb", import.meta.url),
  );
  const json = inspectModelBuffer(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  assert.ok(json.meshes.length >= 10);
  assert.ok(json.buffers[0].byteLength > 0);
  assert.equal(json.buffers[0].uri, undefined);
});
test("model sources reject executable URLs, credentials, external resource references and oversized geometry", () => {
  for (const source of [
    "javascript:alert(1)",
    "data:model/gltf-binary;base64,AA",
    "//elsewhere.example/heart.glb",
    "https://user:pass@example.com/a.glb",
    "/a.fbx",
    "/a?fake=name.glb",
  ])
    assert.equal(safeModelUrl(source), false);
  for (const source of [
    "/assets/heart.glb",
    "/arm.gltf",
    "/mesh.OBJ?v=2",
    "/part.stl",
  ])
    assert.equal(safeModelUrl(source), true);
  assert.equal(safeModelUrl("https://example.com/heart.glb"), true);
  for (const json of [
    { buffers: [{ uri: "https://example.com/data.bin" }] },
    { images: [{ uri: "data:image/png;base64,AA" }] },
    { accessors: [{ count: 2_000_001 }] },
    { extensionsRequired: ["KHR_draco_mesh_compression"] },
    { nodes: Array(1001).fill({}) },
  ])
    assert.throws(() => inspectModelBuffer(glb(json)));
  assert.throws(() => inspectModelBuffer(new ArrayBuffer(32)));
});
test("scene model/pulse schema rejects missing sources and excessive animation", () => {
  const object = {
    shape: "model",
    label: "Heart",
    src: "/assets/heart.glb",
    pulse: { bpm: 72, amplitude: 0.09 },
  };
  assert.equal(
    parseBlock("scene", JSON.stringify({ title: "Heart", objects: [object] }))
      .kind,
    "scene",
  );
  for (const changed of [
    { ...object, src: undefined },
    { ...object, pulse: { bpm: 999 } },
    { ...object, pulse: { amplitude: 1 } },
    { ...object, shape: "sphere" },
  ])
    assert.throws(() =>
      parseBlock(
        "scene",
        JSON.stringify({ title: "Heart", objects: [changed] }),
      ),
    );
});
test("illustrative heartbeat contracts, relaxes, and repeats at the declared rate", () => {
  const interval = 60 / 72;
  assert.ok(pulseScale(0, 72, 0.09) > 0.99);
  assert.equal(pulseScale(0.23 * interval, 72, 0.09), 0.91);
  assert.ok(pulseScale(0.8 * interval, 72, 0.09) > 0.999);
  assert.ok(
    Math.abs(
      pulseScale(0.23 * interval, 72, 0.09) -
        pulseScale(1.23 * interval, 72, 0.09),
    ) < 1e-12,
  );
});

test("JSON glTF admits self-contained exports and rejects external dependencies", () => {
  const json = (fields: object) =>
    new TextEncoder().encode(
      JSON.stringify({ asset: { version: "2.0" }, ...fields }),
    ).buffer;
  assert.doesNotThrow(() =>
    inspectGltfJSON(
      json({ buffers: [{ uri: "data:application/octet-stream;base64,AAAA" }] }),
    ),
  );
  for (const fields of [
    { buffers: [{ uri: "part.bin" }] },
    { images: [{ uri: "https://other.test/texture.png" }] },
    { images: [{ uri: "data:image/svg+xml;base64,PHN2Zz4=" }] },
    { buffers: [{}] },
    { asset: { version: "1.0" } },
  ])
    assert.throws(() => inspectGltfJSON(json(fields)));
});
