import { api } from "../api";
import { MODEL_BYTE_LIMIT } from "./scene-model-format";

export type DiagramFileKind = "model" | "clip";
const extensions = { model: ["glb", "gltf", "obj", "stl"], clip: ["json"] };

export function diagramFileKind(
  file: Pick<File, "name">,
): DiagramFileKind | undefined {
  const format = extension(file.name);
  if (extensions.model.includes(format)) return "model";
  if (extensions.clip.includes(format)) return "clip";
}
function extension(name: string) {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() || "";
}
export async function uploadDiagramFile(
  kind: DiagramFileKind,
  file: File,
  signal: AbortSignal,
) {
  const format = fileFormat(kind, file);
  return api<{ url: string }>(`/media/models?format=${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
    signal,
  });
}
function fileFormat(kind: DiagramFileKind, file: File) {
  const format = extension(file.name);
  if (!extensions[kind].includes(format))
    throw new Error(
      `Choose a ${extensions[kind].join(", ").toUpperCase()} file.`,
    );
  if (!file.size || file.size > MODEL_BYTE_LIMIT)
    throw new Error("Choose a non-empty file of 20 MiB or less.");
  return format;
}
