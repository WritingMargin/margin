import {
  AnimationClip,
  MathUtils,
  NormalAnimationBlendMode,
  AdditiveAnimationBlendMode,
  InterpolateDiscrete,
  InterpolateLinear,
  InterpolateSmooth,
  InterpolateBezier,
  type Object3D,
} from "three";
import { z } from "zod";

const samples = z.array(z.number().min(-3.4e38).max(3.4e38)).min(1);
const nativeClip = z.object({
  name: z.string(),
  duration: z.number().finite(),
  blendMode: z
    .literal([NormalAnimationBlendMode, AdditiveAnimationBlendMode])
    .optional(),
  tracks: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["number", "vector", "quaternion"]),
        times: samples,
        values: samples,
        interpolation: z
          .literal([
            InterpolateDiscrete,
            InterpolateLinear,
            InterpolateSmooth,
            InterpolateBezier,
          ])
          .optional(),
        settings: z
          .object({ inTangents: samples, outTangents: samples })
          .optional(),
      }),
    )
    .min(1)
    .max(1000),
});

// Restrict bindings to model transforms. Three's general PropertyBinding syntax
// also addresses arbitrary nested object properties.
function bindTransform(name: string, root: Object3D) {
  const match =
    /^([^.[\]\/]*?)\.(position|scale|quaternion|rotation)(?:\[([xyzw])\])?$/.exec(
      name,
    );
  if (!match)
    throw new Error(
      "Use position, scale, quaternion or Euler component animation tracks.",
    );
  const [, node, property, component] = match;
  if (
    (component === "w" && property !== "quaternion") ||
    (property === "rotation" && !component)
  )
    throw new Error("Invalid animation transform component.");
  const target = node ? root.getObjectByName(node) : root;
  if (!target)
    throw new Error(`Animation target “${node}” is missing from the model.`);
  const suffix = name.slice(node.length);
  const type = component
    ? "number"
    : property === "quaternion"
      ? "quaternion"
      : "vector";
  return {
    name: target.uuid + suffix,
    type,
  };
}

export function parseClipJSON(buffer: ArrayBuffer, root: Object3D) {
  const clip = nativeClip.safeParse(
    JSON.parse(new TextDecoder().decode(buffer)),
  );
  if (!clip.success)
    throw new Error(
      "Use a Three.js AnimationClip JSON file with numeric transform tracks.",
    );
  const data = clip.data;
  const tracks = data.tracks.map((track) => {
    const binding = bindTransform(track.name, root);
    const width = { number: 1, vector: 3, quaternion: 4 }[track.type];
    if (
      track.type !== binding.type ||
      track.values.length !== track.times.length * width
    )
      throw new Error(
        "The animation track values do not match the model transform.",
      );
    if (
      track.times.some(
        (time, index) =>
          time < 0 || (index > 0 && time < track.times[index - 1]),
      )
    )
      throw new Error("Animation times must increase from zero or later.");
    return { ...track, name: binding.name };
  });
  return AnimationClip.parse({
    ...data,
    tracks,
    uuid: MathUtils.generateUUID(),
    blendMode: data.blendMode ?? NormalAnimationBlendMode,
  });
}
