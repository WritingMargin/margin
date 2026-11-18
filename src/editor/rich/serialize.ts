import type { Node as PMNode } from "@tiptap/pm/model";
import type { JSONContent } from "@tiptap/core";
import { MARGIN_COMPONENT, type ImportedMarkdown } from "./markdown";
import { codeFence, escapePositions, linkTail } from "./escape";

/**
 * Serialize a ProseMirror document to Markdown while recording a position map
 * between document positions and Markdown offsets. This is the linchpin for the
 * existing `WriterEditor` contract (value / selectionStart / setSelectionRange)
 * used by search, review, citations, templates, and offset-based insertion.
 */

export type Segment = {
  /** Document positions spanned by this segment (exclusive `to`). */
  from: number;
  to: number;
  /** Markdown offset of `from`. */
  offset: number;
  /** Markdown length of the segment. Equals `to - from` for plain text. */
  length: number;
  /** Atomic nodes (components) are a single position with arbitrary length. */
  atom?: boolean;
};

export type Serialized = {
  markdown: string;
  segments: Segment[];
};

class Acc {
  text = "";
  segments: Segment[] = [];
  /** False only when comparing an untouched block with its original source. */
  constructor(readonly escape = true) {}
  write(value: string) {
    this.text += value;
  }
  get offset() {
    return this.text.length;
  }
  textSegment(from: number, to: number) {
    const offset = this.offset;
    this.segments.push({
      from,
      to,
      offset,
      length: to - from,
    });
  }
}

/* ------------------------------------------------- untouched block memory */

/**
 * ProseMirror keeps the same node object for every top-level block a
 * transaction doesn't touch. After loading Markdown we remember each block's
 * original source (and the blank lines around it) by node identity, so saving
 * writes untouched blocks back byte for byte. Edited blocks are new objects and
 * are serialized normally. Nothing here changes the document itself.
 */
type Load = { trailing: string | null };
type Origin = {
  load: Load;
  index: number;
  source: string | null;
  gapBefore: string | null;
};

const origins = new WeakMap<PMNode, Origin>();

/** Origins of the most recent load, by top-level child index. Undoing a step
 *  rebuilds its nodes without identity; a rebuilt block whose content still
 *  lines up with its loaded source (verified in keepOriginal) keeps that
 *  source, so undo never drifts alternate Markdown syntax. */
let loadedByIndex: Origin[] = [];

export function rememberSources(doc: PMNode, imported: ImportedMarkdown) {
  const content: JSONContent[] = imported.doc.content ?? [];
  if (doc.childCount !== content.length) return;
  const load: Load = { trailing: imported.trailing };
  const byIndex: Origin[] = [];
  doc.forEach((node, _offset, index) => {
    if (content[index]?.type !== node.type.name) return;
    const origin: Origin = {
      load,
      index,
      source: imported.sources[index] ?? null,
      gapBefore: imported.gaps[index] ?? null,
    };
    origins.set(node, origin);
    byIndex[index] = origin;
  });
  loadedByIndex = byIndex;
}

/** Blank-line-only text that can safely separate two blocks again. */
function isLayoutGap(text: string | null, needsNewline: boolean): text is string {
  if (text === null || !/^[ \t\r\n]*$/.test(text)) return false;
  return !needsNewline || text.includes("\n");
}

/**
 * Swap a freshly serialized block for its original source when they line up
 * character for character over every text run, so offsets used by search,
 * citations, and review stay exact. Otherwise keep the serialized form.
 */
function keepOriginal(acc: Acc, node: PMNode, pos: number, source: string): boolean {
  const raw = new Acc(false);
  block(node, pos, raw);
  if (raw.text !== source && !alignsWith(raw, source)) return false;
  const start = acc.offset;
  acc.write(source);
  for (const segment of raw.segments) acc.segments.push({ ...segment, offset: segment.offset + start });
  return true;
}

/** Same characters over every text run (soft wraps aside), so offsets stay exact. */
function alignsWith(raw: Acc, source: string) {
  if (raw.text.length !== source.length) return false;
  return raw.segments.every((segment) => {
    if (segment.atom) return true;
    const now = raw.text.slice(segment.offset, segment.offset + segment.length);
    const before = source.slice(segment.offset, segment.offset + segment.length);
    return now.replace(/\s/g, " ") === before.replace(/\s/g, " ");
  });
}

/** Did these two blocks sit next to each other in the loaded Markdown? */
function wasAdjacent(origin: Origin | undefined, previous: Origin | undefined) {
  if (!origin || !previous) return false;
  return origin.load === previous.load && origin.index === previous.index + 1;
}

/** Original spacing before a block when it still applies, else the default. */
function separator(origin: Origin | undefined, previous: Origin | undefined, first: boolean) {
  if (first)
    return origin?.index === 0 && isLayoutGap(origin.gapBefore, false) ? origin.gapBefore : "";
  const gap = origin?.gapBefore ?? null;
  return wasAdjacent(origin, previous) && isLayoutGap(gap, true) ? gap : "\n\n";
}

export function serializeDoc(doc: PMNode): Serialized {
  const acc = new Acc();
  let first = true;
  let previous: Origin | undefined;
  let loaded: Load | undefined;
  doc.forEach((node, offset, index) => {
    if (isEmptyBlock(node)) return;
    const origin = origins.get(node);
    loaded ??= origin?.load;
    acc.write(separator(origin, previous, first));
    first = false;
    // Untouched blocks keep their original Markdown; edited ones are written
    // fresh. An undone step rebuilds its nodes without identity, so a rebuilt
    // block falls back to the same-index origin. keepOriginal still verifies
    // the content lines up before reusing that source, so a real edit to the
    // block never picks up a stale one.
    const saved = origin ?? loadedByIndex[index];
    const kept = saved?.source != null && keepOriginal(acc, node, offset, saved.source);
    if (!kept) block(node, offset, acc);
    previous = origin;
  });
  // Keep the article's original ending (usually one final newline).
  if (loaded && isLayoutGap(loaded.trailing, false)) acc.write(loaded.trailing);
  return { markdown: acc.text, segments: acc.segments };
}

function isEmptyBlock(node: PMNode): boolean {
  if (
    node.type.name === "horizontalRule" ||
    node.type.name === MARGIN_COMPONENT ||
    node.type.name === "codeBlock"
  )
    return false;
  return node.textContent === "";
}

type BlockWriter = (node: PMNode, pos: number, acc: Acc) => void;

function componentBlock(node: PMNode, pos: number, acc: Acc) {
  const src = String(node.attrs.src ?? "").replace(/\n+$/, "");
  const offset = acc.offset;
  acc.write(src);
  acc.segments.push({
    from: pos,
    to: pos + node.nodeSize,
    offset,
    length: acc.offset - offset,
    atom: true,
  });
}

const blockWriters = new Map<string, BlockWriter>([
  [MARGIN_COMPONENT, componentBlock],
  ["paragraph", inline],
  [
    "heading",
    (node, pos, acc) => {
      acc.write(`${"#".repeat(Number(node.attrs.level ?? 1))} `);
      inline(node, pos, acc, false);
    },
  ],
  ["blockquote", blockquote],
  ["bulletList", (node, pos, acc) => list(node, "-", 1, pos, acc)],
  ["orderedList", (node, pos, acc) => list(node, "", Number(node.attrs.start ?? 1), pos, acc)],
  ["listItem", (node, pos, acc) => listItem(node, "-", 0, pos, acc)],
  ["codeBlock", (node, _pos, acc) => codeBlock(node, acc)],
  ["horizontalRule", (_node, _pos, acc) => acc.write("---")],
]);

/**
 * Unknown blocks (e.g. a pasted node without an extension) write nothing,
 * as before.
 */
function block(node: PMNode, pos: number, acc: Acc) {
  blockWriters.get(node.type.name)?.(node, pos, acc);
}

/** Write a textblock's inline content; `lineStart` is false after a heading's "# ". */
function inline(node: PMNode, pos: number, acc: Acc, lineStart = true) {
  let atLineStart = lineStart;
  node.forEach((child, offset) => {
    const childPos = pos + 1 + offset;
    if (child.isText) emitText(child, childPos, acc, atLineStart);
    else if (child.type.name === "hardBreak") acc.write("  \n");
    atLineStart = child.type.name === "hardBreak";
  });
}

const emphasis: [string, string][] = [
  ["bold", "**"],
  ["italic", "_"],
  ["strike", "~~"],
];

type Delimiters = { open: string; close: string; code?: boolean };

function linkDelimiters(child: PMNode, { open, close }: Delimiters): Delimiters {
  const link = child.marks.find((mark) => mark.type.name === "link");
  const href = link ? String(link.attrs.href ?? "") : "";
  if (!link || !href) return { open, close };
  const title = link.attrs.title ? String(link.attrs.title) : "";
  return { open: "[" + open, close: close + linkTail(href, title) };
}

/** Markdown around a text run: emphasis, then link, then inline code. */
function delimiters(child: PMNode): Delimiters {
  const names = new Set(child.marks.map((mark) => mark.type.name));
  let open = "";
  let close = "";
  for (const [name, token] of emphasis) {
    if (!names.has(name)) continue;
    open += token;
    close = token + close;
  }
  ({ open, close } = linkDelimiters(child, { open, close }));
  if (names.has("code")) {
    const fence = codeFence(child.text ?? "");
    open += fence.open;
    close = fence.close + close;
  }
  return { open, close, code: names.has("code") };
}

/**
 * Write text with backslashes where Markdown would otherwise read formatting.
 * Each run between backslashes gets its own segment, so document positions
 * still map character for character onto the Markdown.
 */
function writeEscaped(text: string, pos: number, acc: Acc, lineStart: boolean) {
  let last = 0;
  for (const i of escapePositions(text, lineStart)) {
    if (i > last) {
      acc.textSegment(pos + last, pos + i);
      acc.write(text.slice(last, i));
    }
    acc.write("\\");
    last = i;
  }
  acc.textSegment(pos + last, pos + text.length);
  acc.write(text.slice(last));
}

function emitText(child: PMNode, pos: number, acc: Acc, lineStart: boolean) {
  const { open, close, code } = delimiters(child);
  const text = child.text ?? "";
  acc.write(open);
  if (code || !acc.escape) {
    acc.textSegment(pos, pos + text.length);
    acc.write(text);
  } else {
    writeEscaped(text, pos, acc, lineStart && open === "");
  }
  acc.write(close);
}

function blockquote(node: PMNode, pos: number, acc: Acc) {
  let first = true;
  node.forEach((child, offset) => {
    if (!first) acc.write("\n");
    first = false;
    acc.write("> ");
    block(child, pos + 1 + offset, acc);
  });
}

function list(node: PMNode, marker: string, start: number, pos: number, acc: Acc) {
  node.forEach((child, offset, index) => {
    if (index > 0) acc.write("\n");
    const itemMarker = marker || `${start + index}.`;
    listItem(child, itemMarker, 0, pos + 1 + offset, acc);
  });
}

function listItem(node: PMNode, marker: string, indent: number, pos: number, acc: Acc) {
  acc.write(" ".repeat(indent));
  let first = true;
  node.forEach((child, offset) => {
    const childPos = pos + 1 + offset;
    if (first) {
      first = false;
      if (child.type.name === "paragraph") {
        acc.write(`${marker} `);
        inline(child, childPos, acc);
        return;
      }
    }
    const pad = " ".repeat(indent + marker.length + 1);
    if (child.type.name === "paragraph") {
      acc.write(`\n${pad}`);
      inline(child, childPos, acc);
    } else if (child.type.name === "bulletList" || child.type.name === "orderedList") {
      acc.write("\n");
      const nestedMarker = child.type.name === "bulletList" ? "-" : "";
      const nestedStart = child.type.name === "orderedList" ? Number(child.attrs.start ?? 1) : 1;
      nestedList(child, nestedMarker, nestedStart, indent + marker.length + 1, childPos, acc);
    } else {
      acc.write(`\n${pad}`);
      block(child, childPos, acc);
    }
  });
}

function nestedList(
  node: PMNode,
  marker: string,
  start: number,
  indent: number,
  pos: number,
  acc: Acc,
) {
  node.forEach((child, offset, index) => {
    if (index > 0) acc.write("\n");
    const itemMarker = marker || `${start + index}.`;
    listItem(child, itemMarker, indent, pos + 1 + offset, acc);
  });
}

function codeBlock(node: PMNode, acc: Acc) {
  const language = String(node.attrs.language ?? "");
  const source = codeText(node);
  let longest = 2;
  for (const match of source.matchAll(/`+/g))
    longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(longest + 1);
  acc.write(`${fence}${language}\n${source}\n${fence}`);
}

function codeText(node: PMNode) {
  let text = "";
  node.forEach((child) => {
    if (child.isText) text += child.text ?? "";
  });
  return text;
}

/* ------------------------------------------------------- position mapping */

function offsetWithin(segment: Segment, pos: number): number {
  if (segment.atom || segment.length === 0)
    return pos <= segment.from ? segment.offset : segment.offset + segment.length;
  return segment.offset + (pos - segment.from);
}

/** Outside every segment: snap to the closest segment edge (end wins ties). */
function nearestOffset(segments: Segment[], pos: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (const seg of segments) {
    const dEnd = Math.abs(seg.to - pos);
    if (dEnd < bestDist) {
      bestDist = dEnd;
      best = seg.offset + seg.length;
    }
    const dStart = Math.abs(seg.from - pos);
    if (dStart < bestDist) {
      bestDist = dStart;
      best = seg.offset;
    }
  }
  return best;
}

export function posToOffset(segments: Segment[], pos: number): number {
  if (segments.length === 0) return 0;
  const inside = segments.find((seg) => pos >= seg.from && pos <= seg.to);
  return inside ? offsetWithin(inside, pos) : nearestOffset(segments, pos);
}

function posWithin(segment: Segment, offset: number): number {
  if (segment.atom || segment.length === 0)
    return offset - segment.offset <= segment.length / 2 ? segment.from : segment.to;
  return segment.from + (offset - segment.offset);
}

/** Outside every segment: snap to the closest segment edge (start wins ties). */
function nearestPos(segments: Segment[], offset: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (const seg of segments) {
    const end = seg.offset + seg.length;
    const dStart = Math.abs(seg.offset - offset);
    if (dStart < bestDist) {
      bestDist = dStart;
      best = seg.from;
    }
    const dEnd = Math.abs(end - offset);
    if (dEnd < bestDist) {
      bestDist = dEnd;
      best = seg.to;
    }
  }
  return best;
}

export function offsetToPos(segments: Segment[], offset: number): number {
  if (segments.length === 0) return 0;
  const inside = segments.find(
    (seg) => offset >= seg.offset && offset <= seg.offset + seg.length,
  );
  return inside ? posWithin(inside, offset) : nearestPos(segments, offset);
}
