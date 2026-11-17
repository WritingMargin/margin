import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { JSONContent } from "@tiptap/core";
import { componentBlocks } from "./markdown-components";
import { codeFence as codeSpan, escapeText, linkTail } from "./escape";

/**
 * Markdown ↔ Tiptap boundary for the rich writer.
 *
 * The stored article stays plain Markdown (plus the existing bracket tags and
 * directives). This module converts it into a Tiptap document for rich editing
 * and back, preserving every custom component byte for byte. Prose that uses
 * constructs outside the supported set (tables, raw HTML, references, task
 * lists, …) is kept as an opaque component so it still renders identically and
 * is only editable through Code mode.
 */

const parser = unified().use(remarkParse).use(remarkGfm);

export const MARGIN_COMPONENT = "marginComponent";

/** Unsupported prose falls back to an opaque component instead of being lost. */
class Unsupported extends Error {
  constructor(readonly nodeType: string) {
    super(`Unsupported markdown node: ${nodeType}`);
  }
}

function componentNode(src: string, label: string, kind?: string): JSONContent {
  return {
    type: MARGIN_COMPONENT,
    attrs: { src, label, kind: kind ?? "" },
  };
}

/* ------------------------------------------------------------------ import */

export function importMarginMarkdown(source: string): JSONContent {
  return importMarginMarkdownWithSources(source).doc;
}

/**
 * Import Markdown and also return the exact source slice behind each top-level
 * block (`sources[i]` belongs to `doc.content[i]`). The writer uses these to
 * save blocks the author never touched byte for byte instead of re-formatting
 * them (see `rememberSources` in serialize.ts).
 */
export type ImportedMarkdown = {
  doc: JSONContent;
  /** Exact source of each top-level prose block; null for components. */
  sources: (string | null)[];
  /** Source text between block i-1 and block i (before the first for i = 0). */
  gaps: (string | null)[];
  /** Source text after the last block (usually the final newline). */
  trailing: string | null;
};

export function importMarginMarkdownWithSources(source: string): ImportedMarkdown {
  const blocks = componentBlocks(source);
  const content: JSONContent[] = [];
  const sources: (string | null)[] = [];
  const ranges: ({ from: number; to: number } | null)[] = [];

  const pushProse = (text: string, base: number) => {
    if (!text) return;
    const tree = parser.parse(text) as unknown as { children: MdastNode[] };
    const texts = tree.children.map((child) => {
      const start = child.position?.start.offset;
      const end = child.position?.end.offset;
      return start != null && end != null ? text.slice(start, end) : null;
    });
    if (texts.some((range) => range === null)) {
      // Defensive: without source positions, keep the old all-or-nothing
      // behaviour so no text is ever lost or duplicated.
      try {
        const nodes = tree.children.map(blockNode);
        content.push(...nodes);
        sources.push(...nodes.map(() => null));
        ranges.push(...nodes.map(() => null));
      } catch (error) {
        if (!(error instanceof Unsupported)) throw error;
        content.push(componentNode(text, "Markdown", "markdown"));
        sources.push(null);
        ranges.push(null);
      }
      return;
    }
    tree.children.forEach((child, index) => {
      const original = texts[index]!;
      ranges.push({
        from: base + child.position!.start.offset!,
        to: base + child.position!.end.offset!,
      });
      try {
        content.push(blockNode(child));
        sources.push(original);
      } catch (error) {
        if (!(error instanceof Unsupported)) throw error;
        // Only this block becomes a Code-mode component; the prose around it
        // stays editable.
        content.push(
          componentNode(original, fallbackLabel(error.nodeType), "markdown"),
        );
        sources.push(null);
      }
    });
  };

  let cursor = 0;
  for (const block of blocks) {
    pushProse(source.slice(cursor, block.from), cursor);
    content.push(componentNode(block.src, block.label, block.kind));
    sources.push(null);
    ranges.push({ from: block.from, to: block.to });
    cursor = block.to;
  }
  pushProse(source.slice(cursor), cursor);

  const gaps = ranges.map((range, index) => {
    if (!range) return null;
    if (index === 0) return source.slice(0, range.from);
    const previous = ranges[index - 1];
    return previous ? source.slice(previous.to, range.from) : null;
  });
  const last = ranges[ranges.length - 1];
  const trailing = last ? source.slice(last.to) : null;
  return { doc: { type: "doc", content }, sources, gaps, trailing };
}

const fallbackLabels: Record<string, string> = {
  table: "Table",
  html: "HTML",
  image: "Image",
  imageReference: "Image",
  linkReference: "Link",
  definition: "Link reference",
  footnoteDefinition: "Footnote",
  footnoteReference: "Footnote",
  taskList: "Task list",
};

function fallbackLabel(nodeType: string) {
  return fallbackLabels[nodeType] ?? "Markdown";
}

type MdastNode = {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  lang?: string | null;
  meta?: string | null;
  url?: string;
  title?: string | null;
  alt?: string | null;
  checked?: boolean | null;
  children?: MdastNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

type BlockBuilder = (node: MdastNode) => JSONContent;

function listNode(node: MdastNode): JSONContent {
  const type = node.ordered ? "orderedList" : "bulletList";
  const attrs =
    node.ordered && node.start && node.start !== 1
      ? { start: node.start }
      : undefined;
  return {
    type,
    attrs,
    content: (node.children ?? []).map(listItemNode),
  };
}

const blockBuilders = new Map<string, BlockBuilder>([
  ["paragraph", (node) => ({ type: "paragraph", content: inlineNodes(node.children ?? []) })],
  [
    "heading",
    (node) => ({
      type: "heading",
      attrs: { level: node.depth ?? 1 },
      content: inlineNodes(node.children ?? []),
    }),
  ],
  [
    "blockquote",
    (node) => ({
      type: "blockquote",
      content: (node.children ?? []).map(blockNode),
    }),
  ],
  ["list", listNode],
  ["listItem", (node) => listItemNode(node)],
  [
    "code",
    (node) => ({
      type: "codeBlock",
      attrs: { language: node.lang || null },
      content: node.value ? [{ type: "text", text: node.value }] : [],
    }),
  ],
  ["thematicBreak", () => ({ type: "horizontalRule" })],
]);

function blockNode(node: MdastNode): JSONContent {
  const build = blockBuilders.get(node.type);
  if (!build) throw new Unsupported(node.type);
  return build(node);
}

function listItemNode(node: MdastNode): JSONContent {
  if (node.checked != null) throw new Unsupported("taskList");
  return {
    type: "listItem",
    content: (node.children ?? []).map(blockNode),
  };
}

function inlineNodes(nodes: MdastNode[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes) pushInline(node, [], out);
  return out;
}

type Marks = JSONContent["marks"];
type InlineHandler = (node: MdastNode, marks: Marks, out: JSONContent[]) => void;

/** Push every child of `node` with one more mark (a fresh mark per child). */
function pushMarked(
  node: MdastNode,
  marks: Marks,
  out: JSONContent[],
  mark: () => NonNullable<Marks>[number],
) {
  for (const child of node.children ?? [])
    pushInline(child, [...(marks ?? []), mark()], out);
}

const inlineHandlers = new Map<string, InlineHandler>([
  [
    "text",
    (node, marks, out) => {
      out.push({ type: "text", text: softBreakToSpace(node.value ?? ""), marks });
    },
  ],
  ["emphasis", (node, marks, out) => pushMarked(node, marks, out, () => ({ type: "italic" }))],
  ["strong", (node, marks, out) => pushMarked(node, marks, out, () => ({ type: "bold" }))],
  ["delete", (node, marks, out) => pushMarked(node, marks, out, () => ({ type: "strike" }))],
  [
    "inlineCode",
    (node, marks, out) => {
      out.push({
        type: "text",
        text: node.value ?? "",
        marks: [...(marks ?? []), { type: "code" }],
      });
    },
  ],
  [
    "link",
    (node, marks, out) =>
      pushMarked(node, marks, out, () => ({
        type: "link",
        attrs: {
          href: node.url ?? "",
          ...(node.title ? { title: node.title } : {}),
        },
      })),
  ],
  ["break", (_node, _marks, out) => out.push({ type: "hardBreak" })],
]);

function pushInline(node: MdastNode, marks: Marks, out: JSONContent[]) {
  const handle = inlineHandlers.get(node.type);
  if (!handle) throw new Unsupported(node.type);
  handle(node, marks, out);
}

function softBreakToSpace(value: string) {
  return value.replace(/\n/g, " ");
}

/* ------------------------------------------------------------------ export */

export function exportMarginMarkdown(doc: JSONContent): string {
  const blocks = (doc.content ?? []).map(blockText).filter((b) => b !== "");
  return blocks.join("\n\n") + (blocks.length ? "\n" : "");
}

type BlockWriter = (node: JSONContent) => string;

function orderedListText(node: JSONContent) {
  const start = Number(node.attrs?.start ?? 1);
  return (node.content ?? [])
    .map((item, index) => listItemText(item, `${start + index}.`, 0))
    .join("\n");
}

function firstChildText(node: JSONContent) {
  const first = (node.content ?? [])[0];
  if (first?.type === "paragraph")
    return inlineText(first.content ?? []);
  return blockText(first ?? {});
}

function codeBlockText(node: JSONContent) {
  return codeFence(
    node.content?.map((c) => c.text ?? "").join("") ?? "",
    String(node.attrs?.language ?? ""),
  );
}

const blockWriters = new Map<string, BlockWriter>([
  [MARGIN_COMPONENT, (node) => String(node.attrs?.src ?? "").replace(/\n+$/, "")],
  ["paragraph", (node) => inlineText(node.content ?? [])],
  [
    "heading",
    (node) => `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inlineText(node.content ?? [], false)}`,
  ],
  [
    "blockquote",
    (node) =>
      (node.content ?? [])
        .map((child) => prefixLines(blockText(child), "> "))
        .join("\n"),
  ],
  [
    "bulletList",
    (node) =>
      (node.content ?? [])
        .map((item) => listItemText(item, "-", 0))
        .join("\n"),
  ],
  ["orderedList", orderedListText],
  ["listItem", firstChildText],
  ["codeBlock", codeBlockText],
  ["horizontalRule", () => "---"],
]);

function blockText(node: JSONContent): string {
  const write = blockWriters.get(node.type ?? "");
  return write ? write(node) : "";
}

const emphasis = new Map([
  ["bold", "**"],
  ["italic", "_"],
  ["strike", "~~"],
]);

type Mark = NonNullable<JSONContent["marks"]>[number];

function withLink(value: string, marks: Mark[]) {
  const link = marks.find((m) => m.type === "link");
  const href = link?.attrs?.href;
  const title = link?.attrs?.title;
  if (!href) return value;
  return `[${value}${linkTail(String(href), title ? String(title) : "")}`;
}

function inlineNodeText(node: JSONContent, lineStart: boolean): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type !== "text") return "";
  const text = node.text ?? "";
  const marks = node.marks ?? [];
  if (marks.some((m) => m.type === "code")) {
    const fence = codeSpan(text);
    return withLink(fence.open + text + fence.close, marks);
  }
  const opens = marks.some((m) => emphasis.has(m.type) || m.type === "link");
  let value = escapeText(text, lineStart && !opens);
  for (const mark of marks) {
    const token = emphasis.get(mark.type);
    if (token) value = `${token}${value}${token}`;
  }
  return withLink(value, marks);
}

function inlineText(nodes: JSONContent[], lineStart = true): string {
  let atLineStart = lineStart;
  return nodes
    .map((node) => {
      const text = inlineNodeText(node, atLineStart);
      atLineStart = node.type === "hardBreak";
      return text;
    })
    .join("");
}

function listItemText(node: JSONContent, marker: string, indent: number): string {
  const children = node.content ?? [];
  const pad = " ".repeat(indent);
  const parts: string[] = [];
  let first = true;
  for (const child of children) {
    if (child.type === "paragraph") {
      parts.push(
        (first ? `${pad}${marker} ` : pad + " ".repeat(marker.length + 1)) +
          inlineText(child.content ?? []),
      );
    } else if (child.type === "bulletList" || child.type === "orderedList") {
      parts.push(
        (child.content ?? [])
          .map((item) => {
            const nestedMarker =
              child.type === "bulletList" ? "-" : `${Number(child.attrs?.start ?? 1)}.`;
            return listItemText(item, nestedMarker, indent + marker.length + 1);
          })
          .join("\n"),
      );
    } else {
      parts.push(prefixLines(blockText(child), pad + " ".repeat(marker.length + 1)));
    }
    first = false;
  }
  return parts.join("\n");
}

function prefixLines(text: string, prefix: string) {
  return text
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
}

function codeFence(source: string, language: string) {
  let longest = 2;
  for (const match of source.matchAll(/`+/g))
    longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(longest + 1);
  return `${fence}${language}\n${source}\n${fence}`;
}
