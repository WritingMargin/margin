import { marker, tagAttributes } from "../../../shared/content-tags";
import { blockLanguages, type BlockLanguage } from "../../blocks/schema";

/**
 * Pure helpers for the component settings dialog. They parse and regenerate the
 * authored source for the small number of "properties" the writer edits without
 * touching the payload, leaving everything else to Code mode.
 */

export type PropertyField = {
  name: string;
  label: string;
  type: "text" | "select";
  options?: string[];
  placeholder?: string;
};

const selectOptions: Record<string, string[]> = {
  width: ["full", "wide", "two-thirds", "half", "third", "small"],
  align: ["left", "center", "right"],
  frame: ["auto", "plain", "border", "polaroid"],
  mode: ["player", "preview"],
  tone: ["note", "tip", "warning"],
  fit: ["contain", "cover"],
  orientation: ["horizontal", "vertical"],
  variant: ["underline", "pills", "boxed"],
  spacing: ["comfortable", "compact"],
  ratio: ["equal", "wide-left", "wide-right"],
  columns: ["2", "3"],
  wrap: ["true", "false"],
  sticky: ["true", "false"],
  floating: ["false", "true"],
};

const fieldsForTag: Record<string, string[]> = {
  Image: ["src", "alt", "caption", "frame", "width", "align"],
  Video: ["src", "title", "caption", "frame", "width", "align", "wrap", "ratio", "sticky"],
  Audio: ["src", "title", "caption", "width", "align", "mode"],
  Spotify: ["src", "title", "width", "mode"],
  SoundCloud: ["src", "title", "width", "mode"],
  Social: ["url", "title"],
  Link: ["url", "title", "description", "image", "mode"],
  Model: ["src", "title", "clip", "description", "width", "align"],
  Figma: ["url", "title", "width", "align"],
  Callout: ["tone"],
  Carousel: ["title", "fit"],
  Tabs: ["orientation", "title", "variant", "spacing", "initial", "accent", "radius"],
  Tab: ["title"],
  Widget: ["width", "height", "align", "wrap"],
  Widgets: ["columns", "ratio"],
  Columns: ["columns", "ratio"],
  Column: [],
  Checklist: ["title", "floating"],
  Diagram: ["width", "height", "align", "wrap"],
  Mermaid: ["width", "height", "align", "wrap"],
  Chart: ["width", "height", "align", "wrap"],
  Scene: ["width", "height", "align", "wrap"],
  Illustration: ["width", "height", "align", "wrap"],
  Poll: ["width", "height", "align", "wrap"],
};

export type ComponentKind = {
  type: "tag" | "fence" | "directive";
  tag?: string;
  language?: BlockLanguage;
  name?: string;
};

export function componentKind(src: string, kind?: string): ComponentKind {
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const tag = marker(firstLine);
  if (tag && !tag.close) return { type: "tag", tag: tag.tag };
  const fence = /^ {0,3}(`{3,}|~{3,})([a-z0-9+#-]*)/i.exec(firstLine);
  if (fence) {
    const lang = fence[2].toLowerCase();
    if (blockLanguages.includes(lang as BlockLanguage))
      return { type: "fence", language: lang as BlockLanguage };
  }
  const directive = /^ {0,3}:{2,}([a-z][a-z0-9_-]*)/i.exec(firstLine);
  if (directive) return { type: "directive", name: directive[1].toLowerCase() };
  if (kind) return { type: "fence" };
  return { type: "directive" };
}

export function propertyFields(kind: ComponentKind): PropertyField[] {
  const names = kind.type === "tag" ? fieldsForTag[kind.tag ?? ""] ?? [] : [];
  return names.map((name) => ({
    name,
    label: name[0].toUpperCase() + name.slice(1),
    type: selectOptions[name] ? "select" : "text",
    options: selectOptions[name],
  }));
}

export function currentAttributes(src: string): Record<string, string> {
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const tag = marker(firstLine);
  return tag && !tag.close ? tag.attributes : {};
}

/** Replace the attributes on the opening tag, preserving the rest verbatim. */
export function withAttributes(
  src: string,
  attributes: Record<string, string>,
): string {
  const lines = src.split(/\r?\n/);
  const tag = marker(lines[0] ?? "");
  if (!tag || tag.close) return src;
  const close = lines[0]!.includes("/]");
  const opening = `[${tag.tag}${tagAttributes(attributes)}${close ? " /" : ""}]`;
  return [opening, ...lines.slice(1)].join("\n");
}

function fenceParts(src: string) {
  const lines = src.split(/\r?\n/);
  const open = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(lines[0] ?? "");
  if (!open) return null;
  const fence = open[1];
  const language = open[2].trim().split(/\s/)[0];
  const close = lines.findIndex(
    (line, i) =>
      i > 0 &&
      new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`).test(line),
  );
  if (close < 0) return null;
  return { fence, language, body: lines.slice(1, close).join("\n"), tail: lines.slice(close) };
}

/** Apply a layout wrapper to a fenced block, preserving its source exactly. */
export function applyLayout(src: string, layout: Record<string, string>): string {
  const existing = marker(src.split(/\r?\n/, 1)[0] ?? "");
  if (existing && !existing.close && existing.tag === "Widget") {
    return withAttributes(src, { ...currentAttributes(src), ...layout });
  }
  const parts = fenceParts(src);
  if (!parts) return src;
  const active = Object.fromEntries(
    Object.entries(layout).filter(([, value]) => value !== ""),
  );
  const close = parts.tail.join("\n");
  if (!Object.keys(active).length)
    return `${parts.fence}${parts.language}\n${parts.body}\n${close}`;
  return `[Widget${tagAttributes(active)}]\n${parts.fence}${parts.language}\n${parts.body}\n${close}\n[/Widget]`;
}

export function codeLanguageFor(kind: ComponentKind): string {
  if (kind.type === "fence" && kind.language === "mermaid") return "mermaid";
  if (kind.type === "fence") return "json";
  if (kind.type === "tag" && ["Chart", "Scene", "Illustration", "Poll"].includes(kind.tag ?? ""))
    return "json";
  return "markdown";
}

/** Bracket tags whose payload is the tag body (raw/container) or none (leaf). */
export function isRichPayload(kind: ComponentKind): boolean {
  if (kind.type === "fence") return true;
  return kind.type === "tag" &&
    ["Chart", "Scene", "Illustration", "Poll", "Diagram", "Mermaid"].includes(kind.tag ?? "");
}
