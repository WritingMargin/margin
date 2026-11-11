export const MODEL_BYTE_LIMIT = 20 * 1024 * 1024;
export const modelUrlHint =
  "Use an HTTPS or root-relative GLB, glTF, OBJ or STL URL.";

function assetPath(source: string) {
  if (!/^(?:https:\/\/|\/(?!\/))/i.test(source) || /[\s\\]/.test(source))
    return;
  try {
    const url = new URL(source, "https://margin.invalid");
    if (url.username || url.password) return;
    return url.pathname;
  } catch {
    return;
  }
}
export function modelFormat(source: string) {
  return /\.(glb|gltf|obj|stl)$/i
    .exec(assetPath(source) ?? "")?.[1]
    .toLowerCase();
}
export const safeClipUrl = (source: string) =>
  /\.json$/i.test(assetPath(source) ?? "");
export const safeModelUrl = (source: string) => Boolean(modelFormat(source));

/** GLB v2 only, with embedded resources. No secondary network requests. */
export function inspectModelBuffer(buffer: ArrayBuffer) {
  if (buffer.byteLength > MODEL_BYTE_LIMIT || buffer.byteLength < 20)
    throw new Error("Use a GLB model no larger than 20 MiB.");
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error("Use a valid binary glTF 2.0 (.glb) model.");
  const length = view.getUint32(12, true);
  if (
    view.getUint32(16, true) !== 0x4e4f534a ||
    length > buffer.byteLength - 20
  )
    throw new Error("The GLB JSON chunk is invalid.");
  validateBinaryChunk(view, 20 + length);
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, length)),
  );
  validateModelResources(json);
  return json;
}
export function inspectGltfJSON(buffer: ArrayBuffer) {
  if (buffer.byteLength > MODEL_BYTE_LIMIT)
    throw new Error("Keep models within 20 MiB.");
  const json = JSON.parse(new TextDecoder().decode(buffer));
  validateModelResources(json, true);
  return json;
}

function validateModelResources(json: any, embeddedUris = false) {
  if (json?.asset?.version !== "2.0")
    throw new Error("Export a glTF 2.0 model.");
  if ((json.extensionsRequired ?? []).length)
    throw new Error(
      "Export glTF without required decoder or material extensions.",
    );
  validateEmbeddedBuffers(json.buffers ?? [], embeddedUris);
  validateEmbeddedImages(json.images ?? [], embeddedUris);
  validateGeometrySize(json);
}

function validateGeometrySize(json: any) {
  const vertices = (json.accessors ?? []).reduce(
    (sum: number, accessor: any) =>
      sum +
      (Number.isSafeInteger(accessor.count) && accessor.count >= 0
        ? accessor.count
        : Infinity),
    0,
  );
  if (vertices > 2_000_000)
    throw new Error("Keep model accessor counts below two million.");
  if ((json.nodes ?? []).length > 1000)
    throw new Error("Keep models below 1,000 nodes.");
}

function validateEmbeddedBuffers(
  buffers: { uri?: string }[],
  embeddedUris: boolean,
) {
  for (const buffer of buffers) {
    if (
      embeddedUris &&
      /^data:application\/(?:octet-stream|gltf-buffer);base64,/i.test(
        buffer.uri ?? "",
      )
    )
      continue;
    if (embeddedUris || buffer.uri !== undefined)
      throw new Error("Embed all buffers in the model file.");
  }
}
function validateEmbeddedImages(
  images: { uri?: string }[],
  embeddedUris: boolean,
) {
  for (const image of images) {
    if (image.uri === undefined) continue;
    if (
      embeddedUris &&
      /^data:image\/(?:png|jpeg|webp);base64,/i.test(image.uri)
    )
      continue;
    throw new Error("Embed PNG, JPEG or WebP images in the model file.");
  }
}

function validateBinaryChunk(view: DataView, start: number) {
  // Three.js uses the last JSON chunk it sees. Keep it bound to the one we inspected.
  for (let offset = start; offset < view.byteLength;) {
    if (view.byteLength - offset < 8) throw new Error("Incomplete GLB chunk.");
    const length = view.getUint32(offset, true);
    if (
      view.getUint32(offset + 4, true) === 0x4e4f534a ||
      length > view.byteLength - offset - 8
    )
      throw new Error("Invalid or duplicate GLB chunk.");
    offset += 8 + length;
  }
}
