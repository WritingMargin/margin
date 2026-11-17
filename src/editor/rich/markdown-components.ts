import { contentTags, marker } from "../../../shared/content-tags";
import { blockLanguages, type BlockLanguage } from "../../blocks/schema";

/**
 * A block-level construct that the rich writer renders exactly like the reader
 * instead of editing as plain prose. The raw source (`src`) is preserved byte
 * for byte so the reader presentation is identical and nothing is lost.
 */
export type MarginComponent = {
  /** Absolute offset of the first character in the source document. */
  from: number;
  /** Absolute offset just past the last character (exclusive). */
  to: number;
  /** Exact raw source, including the opening/closing markers. */
  src: string;
  /** A stable label for the settings dialog and hover affordance. */
  label: string;
  /** Bracket tag name, directive name, or fenced language, when known. */
  kind?: string;
};

type Line = { text: string; start: number; end: number };

/** Split into lines while keeping exact source offsets and stripping `\r`. */
function lines(source: string): Line[] {
  const result: Line[] = [];
  let start = 0;
  for (let i = 0; i <= source.length; i++) {
    if (i === source.length || source[i] === "\n") {
      let end = i;
      if (end > start && source[end - 1] === "\r") end--;
      result.push({ text: source.slice(start, end), start, end });
      start = i + 1;
    }
  }
  if (result.length && result[result.length - 1].start > source.length) result.pop();
  return result;
}

const leafDirective = /^ {0,3}::([a-z][a-z0-9_-]*)(?:\{[^\r\n]*\})?[ \t]*$/i;
const containerDirective = /^ {0,3}:{3,}([a-z][a-z0-9_-]*)?(?:\{[^\r\n]*\})?[ \t]*$/i;

const leafDirectives = new Set([
  "image", "video", "audio", "social", "linkcard", "spotify", "soundcloud",
  "divider", "clear", "model", "figma",
]);
const containerDirectives = new Set([
  "callout", "tabs", "tab", "widget", "widgets", "columns", "column",
  "checklist", "carousel", "font", "highlight", "citation",
]);

const componentLabels: Record<string, string> = {
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
  Tabs: "Tabs",
  Callout: "Callout",
  Checklist: "Checklist",
  Widget: "Widget",
  Widgets: "Widget row",
  Columns: "Columns",
  Column: "Column",
  Diagram: "Diagram",
  Mermaid: "Diagram",
  Chart: "Chart",
  Scene: "3D scene",
  Illustration: "Illustration",
  Poll: "Poll",
};

function fenceInfo(text: string) {
  const match = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(text);
  if (!match) return null;
  return {
    fence: match[1][0],
    length: match[1].length,
    info: match[2].trim(),
    language: match[2].trim().split(/\s/)[0].toLowerCase(),
  };
}

/** Returns the index of the closing line for an opening at `from`, or null. */
function closingLine(
  rows: Line[],
  from: number,
  matches: (text: string) => boolean,
) {
  for (let i = from + 1; i < rows.length; i++) {
    if (matches(rows[i].text)) return i;
  }
  return null;
}

type Fence = NonNullable<ReturnType<typeof fenceInfo>>;

/**
 * What one matcher found at a line:
 * - `undefined`: not this kind of component, try the next matcher;
 * - `null`: this kind, but unfinished, so the line stays prose;
 * - otherwise the component and the last row it spans.
 */
type Match = { block: MarginComponent; last: number } | null | undefined;

function blockFrom(
  source: string,
  rows: Line[],
  first: number,
  last: number,
  label: string,
  kind: string,
): MarginComponent {
  const from = rows[first].start;
  const to = rows[last].end;
  return { from, to, src: source.slice(from, to), label, kind };
}

function closesTag(text: string, tag: string) {
  const found = marker(text);
  return found?.close === true && found.tag === tag;
}

function closesFence(text: string, fence: Fence) {
  const found = fenceInfo(text);
  return !!found && found.fence === fence.fence && found.length >= fence.length && !found.info;
}

function closesDirective(text: string, colons: number) {
  const found = /^ {0,3}(:+)[ \t]*$/.exec(text);
  return !!found && found[1].length >= colons;
}

/** Bracket tags: leaf, raw, and container. */
function tagComponent(source: string, rows: Line[], i: number): Match {
  const tag = marker(rows[i].text);
  if (!tag) return undefined;
  if (tag.close) return null;
  const label = componentLabels[tag.tag] ?? tag.tag;
  if (contentTags[tag.tag].kind === "leaf")
    return { block: blockFrom(source, rows, i, i, label, tag.tag), last: i };
  const close = closingLine(rows, i, (text) => closesTag(text, tag.tag));
  if (close === null) return null;
  return { block: blockFrom(source, rows, i, close, label, tag.tag), last: close };
}

/** Rich fenced blocks (chart, mermaid, scene, illustration, poll). */
function fenceComponent(source: string, rows: Line[], i: number): Match {
  const fence = fenceInfo(rows[i].text);
  if (!fence || !blockLanguages.includes(fence.language as BlockLanguage)) return undefined;
  const close = closingLine(rows, i, (text) => closesFence(text, fence));
  if (close === null) return null;
  const label =
    componentLabels[fence.language[0].toUpperCase() + fence.language.slice(1)] ?? fence.language;
  return { block: blockFrom(source, rows, i, close, label, fence.language), last: close };
}

/** `::name{…}` on its own line, unless the name only exists as a container. */
function leafDirectiveComponent(source: string, rows: Line[], i: number): Match {
  const leaf = leafDirective.exec(rows[i].text);
  if (!leaf) return undefined;
  const name = leaf[1].toLowerCase();
  if (!leafDirectives.has(name) && containerDirectives.has(name)) return undefined;
  return { block: blockFrom(source, rows, i, i, componentLabel(name), name), last: i };
}

/** `:::name{…}` … `:::` blocks, closed by at least as many colons. */
function containerDirectiveComponent(source: string, rows: Line[], i: number): Match {
  const container = containerDirective.exec(rows[i].text);
  if (!container) return undefined;
  const colons = (container[0].match(/^ {0,3}(:+)/) || ["", ":"])[1].length;
  const close = closingLine(rows, i, (text) => closesDirective(text, colons));
  if (close === null) return null;
  const name = container[1]?.toLowerCase() || "widget";
  return { block: blockFrom(source, rows, i, close, componentLabel(name), name), last: close };
}

const matchers = [
  tagComponent,
  fenceComponent,
  leafDirectiveComponent,
  containerDirectiveComponent,
];

function componentAt(source: string, rows: Line[], i: number): Match {
  for (const match of matchers) {
    const found = match(source, rows, i);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Scan the source for block-level custom components (bracket tags, directives,
 * and rich fenced blocks). Unfinished constructs remain prose so the user can
 * keep typing. Returned blocks are ordered and non-overlapping.
 */
export function componentBlocks(source: string): MarginComponent[] {
  const rows = lines(source);
  const blocks: MarginComponent[] = [];
  for (let i = 0; i < rows.length; i++) {
    const found = componentAt(source, rows, i);
    if (!found) continue;
    blocks.push(found.block);
    i = found.last;
  }
  return blocks;
}

/** A minimal name → label helper reused by the settings dialog. */
export function componentLabel(kind: string): string {
  const key = Object.keys(componentLabels).find(
    (k) => k.toLowerCase() === kind.toLowerCase(),
  );
  return key ? componentLabels[key] : kind;
}
