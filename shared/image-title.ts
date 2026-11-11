import type { GeneratedImage } from "./ai";

export function generatedImageTitle(image: Pick<GeneratedImage, "title" | "prompt">): string {
  return image.title?.trim() || image.prompt.trim().split(/\s+/).slice(0, 12).join(" ").slice(0, 90).replace(/[ .,;:!?]+$/, "") || "Generated illustration";
}

export function generatedImageFilename(title: string): string {
  const name = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return `${name || "generated-illustration"}.png`;
}
