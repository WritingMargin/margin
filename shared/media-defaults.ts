import { marker, tagAttributes } from "./content-tags";

export type MediaKind = "image" | "video";
export type MediaDefaults = Record<MediaKind, Record<string, string>> & { audio?: { mode: "player" | "preview" }; link?: { mode: "link" | "preview" } };
const common = {
  frame: ["auto", "plain", "border", "polaroid"],
  align: ["left", "center", "right"],
};
export const mediaDefaultOptions: Record<MediaKind, Record<string, string[]>> = {
  image: { ...common, width: ["full", "wide", "small"] },
  video: { ...common, width: ["full", "wide", "two-thirds", "half", "third", "small", "75%", "40%"], ratio: ["auto", "16:9", "4:3", "1:1", "9:16", "21:9"], wrap: ["true", "false"] },
};
export const initialMediaDefaults: MediaDefaults = {
  audio: { mode: "player" },
  link: { mode: "preview" },
  image: { frame: "auto", width: "full", align: "center" },
  video: { frame: "auto", width: "full", align: "center", ratio: "auto", wrap: "false" },
};
export function mediaDefaultTag(kind: MediaKind, attributes: Record<string, string>) {
  return `[${kind === "image" ? "Image" : "Video"}${tagAttributes(attributes)}]`;
}
export function parseMediaDefaultTag(kind: MediaKind, text: string): Record<string, string> {
  const parsed = marker(text.trim());
  if (!parsed || parsed.close || parsed.tag.toLowerCase() !== kind) throw new Error(`Use one ${kind === "image" ? "Image" : "Video"} tag containing layout properties only.`);
  for (const [key, value] of Object.entries(parsed.attributes)) {
    if (!mediaDefaultOptions[kind][key]?.includes(value)) throw new Error(`Invalid ${kind} default: ${key}. Choose a suggested layout value; URLs and captions belong in individual posts.`);
  }
  return { ...initialMediaDefaults[kind], ...parsed.attributes };
}
export function newMediaTag(kind: MediaKind, src: string, defaults: MediaDefaults) {
  return mediaDefaultTag(kind, { src, ...defaults[kind] });
}
