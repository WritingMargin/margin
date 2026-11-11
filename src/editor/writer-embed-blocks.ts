import { contentTags, marker } from "../../shared/content-tags";
import type { WriterCodeBlock } from "./writer-code-blocks";

const labels: Record<string, string> = {
  Model: "3D model",
  Figma: "Figma embed",
  Image: "Image",
  Video: "Video",
  Audio: "Audio",
  Social: "Social post",
  Link: "Link preview",
  Spotify: "Spotify player",
  SoundCloud: "SoundCloud player",
  Divider: "Divider",
  Clear: "Clear layout",
  Carousel: "Image carousel",
};
/** Keep prose containers, inline citations, fonts and emphasis visible. */
export function writerEmbedLine(
  line: string,
  from: number,
): WriterCodeBlock | null {
  const tag = marker(line);
  if (tag && !tag.close && contentTags[tag.tag].kind === "leaf")
    return {
      from,
      to: from + line.length,
      body: from,
      label:
        tag.tag === "Link" && tag.attributes.mode === "figma"
          ? labels.Figma
          : labels[tag.tag],
    };
  if (/^ {0,3}!\[[^\]\n]*\]\(.+\)[ \t]*$/.test(line))
    return { from, to: from + line.length, body: from, label: "Image" };
  const directive =
    /^ {0,3}::(image|video|audio|social|linkcard|spotify|soundcloud|divider|clear)\b.*$/i.exec(
      line,
    );
  if (!directive) return null;
  const name = Object.keys(labels).find(
    (key) => key.toLowerCase() === directive[1].toLowerCase(),
  );
  return {
    from,
    to: from + line.length,
    body: from,
    label: name ? labels[name] : "Link preview",
  };
}
