import * as THREE from "three";
import { mediaPath } from "../base-path";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  inspectModelBuffer,
  MODEL_BYTE_LIMIT,
  modelFormat,
  safeClipUrl,
  modelUrlHint,
  inspectGltfJSON,
} from "./scene-model-format";

async function downloadAsset(source: string, signal: AbortSignal) {
  const uploaded =
    /^\/api\/public\/models\/[a-f0-9-]{36}\.(?:glb|gltf|obj|stl|json)(?:\?|$)/.test(
      source,
    );
  const response = await fetch(uploaded ? mediaPath(source) : source, {
    signal,
    credentials: uploaded ? "same-origin" : "omit",
    redirect: "error",
  });
  if (!response.ok || !response.body)
    throw new Error(`Model download failed (${response.status}).`);
  return readModelBody(response.body, signal);
}

export async function loadSceneModel(
  source: string,
  signal: AbortSignal,
  animationSrc?: string,
) {
  const format = modelFormat(source);
  if (!format) throw new Error(modelUrlHint);
  const model = await parseSceneModel(
    await downloadAsset(source, signal),
    format,
  );
  let animationError = "";
  try {
    signal.throwIfAborted();
    if (animationSrc) {
      if (!safeClipUrl(animationSrc))
        throw new Error("Use a hosted .json animation clip.");
      const { parseClipJSON } = await import("./scene-clip-json");
      model.animations.push(
        parseClipJSON(await downloadAsset(animationSrc, signal), model.scene),
      );
    }
  } catch (error) {
    animationError = (error as Error).message;
  }
  if (signal.aborted) {
    disposeSceneObject(model.group);
    signal.throwIfAborted();
  }
  return { ...model, animationError };
}

export async function parseSceneModel(buffer: ArrayBuffer, format: string) {
  if (buffer.byteLength > MODEL_BYTE_LIMIT)
    throw new Error("Keep models within 20 MiB.");
  const { scene, animations } = await parseModel(buffer, format);
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(largest) || largest <= 0) {
    disposeSceneObject(scene);
    throw new Error("The model has no visible finite geometry.");
  }
  // Keep normalization outside the animation hierarchy so clips retain their coordinate system.
  const centered = new THREE.Group();
  centered.position.copy(bounds.getCenter(new THREE.Vector3())).negate();
  centered.add(scene);
  const group = new THREE.Group();
  group.add(centered);
  group.scale.setScalar(2.6 / largest);
  return { group, scene, animations };
}

async function parseModel(
  buffer: ArrayBuffer,
  format: string,
): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  if (format === "obj" || format === "stl") {
    const { parseStaticMesh } = await import("./scene-mesh-import");
    return { scene: parseStaticMesh(buffer, format), animations: [] };
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(blob:|data:)/i.test(url)) return url;
    throw new Error("Embed all resources in the model file.");
  });
  const loader = new GLTFLoader(manager);
  if (format === "gltf") return loader.parseAsync(inspectGltfJSON(buffer), "");
  inspectModelBuffer(buffer);
  return loader.parseAsync(buffer, "");
}
async function readModelBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
) {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MODEL_BYTE_LIMIT)
        throw new Error("Keep models within 20 MiB.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
export function eachMaterial(
  object: THREE.Object3D,
  visit: (material: THREE.MeshStandardMaterial) => void,
) {
  object.traverse((child) => {
    if (!(
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof THREE.Points
    ))
      return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach(visit);
  });
}
export function disposeSceneObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) child.skeleton.dispose();
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof THREE.Points
    )
      child.geometry.dispose();
  });
  eachMaterial(object, (material) => {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) {
        value.dispose();
        value.source?.data?.close?.();
      }
    }
    material.dispose();
  });
}
