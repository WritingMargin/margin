import type { Root } from "mdast";
import { fontIds, typography, type BlogFont } from "./typography.ts";

export function resolveFont(name: string): BlogFont | undefined {
  const normalized = name.trim().toLowerCase();
  return fontIds.find(
    (id) =>
      id === normalized || typography[id].name.toLowerCase() === normalized,
  );
}

type Node = {
  type: string;
  value?: string;
  children?: Node[];
  data?: Record<string, unknown>;
  position?: { start: { offset?: number }; end: { offset?: number } };
};
type Token = {
  node: Node;
  marker?: "open" | "close";
  font?: BlogFont;
  tag?: string;
};
const markerPattern = () =>
  /\[Font\s*=\s*["']([^"'\r\n]{1,100})["']\]|\[(Highlight)\]|\[\/(Font|Highlight)\]/gi;

/** Read markers only from Markdown text nodes, never code, HTML, or link destinations. */
function tokens(node: Node, source: string): Token[] {
  const range = textRange(node);
  if (!range) return [{ node }];
  const { value, start, end } = range;
  const raw = source.slice(start, end);
  const rawMatches = [...raw.matchAll(markerPattern())];
  let rawIndex = 0;
  let cursor = 0;
  const result: Token[] = [];
  for (const match of value.matchAll(markerPattern())) {
    // Match the source spelling so escaped delimiters remain literal Markdown.
    const original = rawMatches[rawIndex];
    if (!original || original[0] !== match[0]) continue;
    rawIndex++;
    if (escapedMarker(raw, original.index!)) continue;
    if (match.index! > cursor)
      result.push({
        node: { type: "text", value: value.slice(cursor, match.index) },
      });
    const offset = start + original.index!;
    result.push(fontToken(node, match, offset));
    cursor = match.index! + match[0].length;
  }
  if (!result.length) return [{ node }];
  if (cursor < value.length)
    result.push({ node: { type: "text", value: value.slice(cursor) } });
  return result;
}

function wrap(input: Token[], block: boolean): Node[] {
  const matched = new Set<number>();
  const opens: number[] = [];
  input.forEach((token, index) => {
    if (token.marker === "open") opens.push(index);
    else if (
      token.marker === "close" &&
      opens.length &&
      input[opens.at(-1)!].tag === token.tag
    ) {
      matched.add(opens.pop()!);
      matched.add(index);
    }
  });
  const output: Node[] = [];
  const stack: { token: Token; children: Node[] }[] = [];
  const append = (node: Node) => (stack.at(-1)?.children || output).push(node);
  for (const [index, token] of input.entries()) {
    if (!matched.has(index)) {
      append(token.node);
      continue;
    }
    if (token.marker === "open") stack.push({ token, children: [] });
    else if (token.marker === "close" && stack.length) {
      const frame = stack.pop()!;
      if (stack.length >= 32) {
        frame.children.forEach(append);
        continue;
      }
      // Unknown fonts inherit the blog font; never interpolate arbitrary CSS.
      append(fontNode(frame, block));
    } else append(token.node);
  }
  return output;
}

/** Supports inline spans and sections whose boundaries may share a paragraph with text. */
export default function fontMarkup() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    const walk = (parent: Node) => {
      if (
        !parent.children ||
        ["code", "inlineCode", "html"].includes(parent.type)
      )
        return;
      for (const child of parent.children) walk(child);
      // Inline pairs were handled by the child walk. Match remaining font markers
      // across paragraphs before splitting, so unmatched tags keep their original layout.
      const paragraphs = parent.children.map((child) =>
        child.type === "paragraph"
          ? child.children?.flatMap((node) => tokens(node, source))
          : undefined,
      );
      const matched = matchingSections(paragraphs);
      if (!matched.size) {
        parent.children = wrap(
          parent.children.flatMap((child) => tokens(child, source)),
          false,
        );
        return;
      }
      const blocks: Token[] = [];
      parent.children.forEach((child, index) => {
        const parts = paragraphs[index];
        if (!parts?.some((part) => matched.has(part))) {
          blocks.push({ node: child });
          return;
        }
        let segment: Node[] = [];
        const flush = () => {
          if (
            segment.some((node) => node.type !== "text" || node.value?.trim())
          )
            blocks.push({ node: { ...child, children: segment } });
          segment = [];
        };
        for (const part of parts) {
          if (matched.has(part)) {
            flush();
            blocks.push({ ...part, node: { ...child, children: [part.node] } });
          } else segment.push(part.node);
        }
        flush();
      });
      parent.children = wrap(blocks, true);
    };
    walk(tree as unknown as Node);
  };
}

function textRange(node: Node) {
  if (node.type !== "text" || !node.value) return;
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return;
  return { value: node.value, start, end };
}
function escapedMarker(raw: string, index: number) {
  let count = 0;
  for (let i = index - 1; i >= 0 && raw[i] === "\\"; i--) count++;
  return count % 2 !== 0;
}
function fontToken(node: Node, match: RegExpMatchArray, offset: number): Token {
  return {
    node: {
      ...node,
      value: match[0],
      position: {
        start: { offset },
        end: { offset: offset + match[0].length },
      },
    },
    marker: match[3] ? "close" : "open",
    font: match[1] === undefined ? undefined : resolveFont(match[1]),
    tag: (match[3] || match[2] || "font").toLowerCase(),
  };
}
function fontNode(
  frame: { token: Token; children: Node[] },
  block: boolean,
): Node {
  return {
    type: block ? "fontSection" : "fontSpan",
    children: frame.children,
    data: {
      hName: frame.token.tag === "highlight" ? "mark" : block ? "div" : "span",
      hProperties: frame.token.font ? { dataFont: frame.token.font } : {},
    },
  };
}
function matchingSections(paragraphs: (Token[] | undefined)[]) {
  const opens: Token[] = [];
  const matched = new Set<Token>();
  for (const parts of paragraphs)
    for (const part of parts || []) {
      if (part.tag !== "font") continue;
      if (part.marker === "open") opens.push(part);
      else if (part.marker === "close" && opens.length) {
        matched.add(opens.pop()!);
        matched.add(part);
      }
    }
  return matched;
}
