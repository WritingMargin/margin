import { coverImageLimit, coverImageTypes } from "../../shared/cover";
import { api } from "../api";

export function imageDropError(file: Pick<File, "type" | "size">) {
  if (!coverImageTypes.includes(file.type))
    return "Use a PNG, JPEG, WebP, or GIF image.";
  if (file.size > coverImageLimit) return "Images must be 10 MB or smaller.";
  return "";
}

export function isFileTransfer(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  return Array.from(dataTransfer.types || []).includes("Files");
}

export function extractDroppedFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return [];
  const direct = Array.from(dataTransfer.files || []);
  if (direct.length > 0) return direct;
  const fromItems: File[] = [];
  for (const item of Array.from(dataTransfer.items || [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }
  return fromItems;
}

export function extractPastedImages(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return [];
  if (clipboardData.getData("text/plain").trim()) return [];
  return extractDroppedFiles(clipboardData).filter((file) =>
    file.type.startsWith("image/"),
  );
}

function matchesBytes(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function sniffImageSignature(bytes: Uint8Array): string {
  if (bytes.length < 12) return "";
  if (matchesBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (matchesBytes(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matchesBytes(bytes, 0, [0x47, 0x49, 0x46])) return "image/gif";
  if (matchesBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matchesBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50]))
    return "image/webp";
  return "";
}

export async function detectImageType(file: File): Promise<string> {
  const normalized = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (typeof file.slice === "function") {
    try {
      const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const sniffed = sniffImageSignature(header);
      if (sniffed) return sniffed;
    } catch {
      // Fall back to the browser-reported MIME type when slicing fails.
    }
  }
  return normalized;
}

export async function uploadDroppedImage(file: File, signal?: AbortSignal) {
  const type = await detectImageType(file);
  const error = imageDropError({ type, size: file.size });
  if (error) throw new Error(error);
  return api<{ url: string }>("/media/covers", {
    method: "POST",
    headers: { "Content-Type": type },
    body: file,
    signal,
  });
}

// Follow the insertion point as the writer edits while uploads are pending.
export class ImageInsertion {
  constructor(
    public content: string,
    public position: number,
  ) {}

  update(next: string) {
    if (next === this.content) return;
    let start = 0;
    while (
      start < Math.min(this.content.length, next.length) &&
      this.content[start] === next[start]
    )
      start++;
    let end = this.content.length;
    let nextEnd = next.length;
    while (
      end > start &&
      nextEnd > start &&
      this.content[end - 1] === next[nextEnd - 1]
    ) {
      end--;
      nextEnd--;
    }
    if (this.position >= end) this.position += nextEnd - end;
    else if (this.position > start) this.position = nextEnd;
    this.content = next;
  }

  insert(tag: string) {
    const before = this.content.slice(0, this.position);
    const after = this.content.slice(this.position);
    const prefix = before
      ? "\n".repeat(Math.max(0, 2 - (before.match(/\n*$/)?.[0].length || 0)))
      : "";
    const inserted = `${prefix}${tag}\n\n`;
    this.content = before + inserted + after;
    this.position = before.length + inserted.length;
    return this.content;
  }
}
