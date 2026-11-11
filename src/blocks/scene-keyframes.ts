import {
  AnimationClip,
  Box3,
  NumberKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type KeyframeTrack,
  type Object3D,
} from "three";
import type { SceneSpec } from "./schema";

type SceneObject = SceneSpec["objects"][number];

// Start from the object's authored pose. Position and rotation interpolate
// independently; the mixer holds each track's final value until the loop ends.
export function sceneAnimation(objects: SceneObject[], roots: Object3D[]) {
  const tracks: KeyframeTrack[] = [];
  objects.forEach((object, index) => {
    const frames = object.keyframes;
    if (!frames) return;
    const node = roots[index].uuid;
    const positions = frames.flatMap((frame) =>
      frame.position ? [{ time: frame.time, value: frame.position }] : [],
    );
    if (positions.length) {
      tracks.push(
        new VectorKeyframeTrack(
          node + ".position",
          [0, ...positions.map((p) => p.time)],
          [...object.position, ...positions.flatMap((p) => p.value)],
        ),
      );
    }
    const rotations = frames.flatMap((frame) =>
      frame.rotation ? [{ time: frame.time, value: frame.rotation }] : [],
    );
    if (rotations.length) {
      const times = [0, ...rotations.map((p) => p.time)];
      // Interpolate Euler axes so a full revolution stays a full revolution.
      ["x", "y", "z"].forEach((axis, i) =>
        tracks.push(
          new NumberKeyframeTrack(node + ".rotation[" + axis + "]", times, [
            object.rotation[i],
            ...rotations.map((p) => p.value[i]),
          ]),
        ),
      );
    }
  });
  return tracks.length ? new AnimationClip("Animation", -1, tracks) : undefined;
}

export function animatedObjectBounds(root: Object3D, object: SceneObject) {
  const bounds = new Box3().setFromObject(root);
  if (!object.keyframes || bounds.isEmpty()) return bounds;
  const center = bounds.getCenter(new Vector3());
  const radius =
    center.distanceTo(root.position) +
    bounds.getSize(new Vector3()).length() / 2;
  // A sphere around each endpoint also encloses intermediate rotations.
  const path = new Box3().setFromPoints([new Vector3(...object.position)]);
  for (const frame of object.keyframes) {
    if (frame.position) path.expandByPoint(new Vector3(...frame.position));
  }
  return path.expandByScalar(radius);
}
