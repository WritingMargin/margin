import type { Root, RootContent } from "mdast";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import { tagAttributes } from "./content-tags";

export type Citation = {
  url: string;
  title: string;
  quote: string;
  page: string;
  rect: string;
};
export const documentPath = /^\/api\/public\/documents\/[a-f0-9-]{36}$/;
export function citationURL(raw: string): string {
  if (documentPath.test(raw)) return raw;
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function citationRect(raw: string): number[] | undefined {
  const parts = raw.split(",").map(Number);
  return parts.length === 4 &&
    parts.every(Number.isFinite) &&
    parts[0] >= 0 &&
    parts[1] >= 0 &&
    parts[2] > 0 &&
    parts[3] > 0 &&
    parts[0] + parts[2] <= 1.001 &&
    parts[1] + parts[3] <= 1.001
    ? parts
    : undefined;
}
export function citationPage(raw: string): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1;
}
export function citationTarget(citation: Citation): string {
  const url = citationURL(citation.url);
  if (!url) return "";
  if (documentPath.test(url)) {
    const query = new URLSearchParams({
      page: String(citationPage(citation.page)),
    });
    if (citationRect(citation.rect)) query.set("rect", citation.rect);
    return `/sources/${url.split("/").at(-1)}?${query}`;
  }
  const target = new URL(url);
  if (citation.page || /\.pdf$/i.test(target.pathname))
    target.hash = `page=${citationPage(citation.page)}`;
  else if (citation.quote)
    target.hash = `:~:text=${encodeURIComponent(citation.quote).replace(/-/g, "%2D")}`;
  return target.href;
}
export function citationTag(citation: Citation, text: string) {
  if (!citationURL(citation.url))
    throw new Error(
      "Enter an HTTP or HTTPS source URL, or choose an uploaded PDF.",
    );
  if (citation.page && String(citationPage(citation.page)) !== citation.page)
    throw new Error("Enter a whole PDF page number starting at 1.");
  if (citation.rect && !citationRect(citation.rect))
    throw new Error("Enter a valid highlight area inside the PDF page.");
  return `[Citation${tagAttributes(Object.fromEntries(Object.entries(citation).filter(([, value]) => value)))}]${text}[/Citation]`;
}
const parser = unified().use(remarkParse).use(remarkGfm);
const pairPattern =
  /\[Citation((?:\s+[a-z][a-z0-9_-]*\s*=\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))*)\s*\]([^\r\n]*?)\[\/Citation\]/gi;
function attributes(raw: string) {
  const result: Record<string, string> = {};
  for (const match of raw.matchAll(
    /([a-z][a-z0-9_-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi,
  )) {
    try {
      result[match[1].toLowerCase()] =
        match[2][0] === '"'
          ? JSON.parse(match[2])
          : match[2].slice(1, -1).replace(/\\(['\\])/g, "$1");
    } catch {
      return {};
    }
  }
  return result;
}
function plain(node: Root | RootContent): string {
  if ("value" in node) return node.value;
  return "children" in node
    ? node.children.map((child) => plain(child as RootContent)).join("")
    : "";
}
/** Tags are inline and explicit. Code samples, escaped tags and link labels stay literal. */
export function expandCitations(source: string): string {
  if (!/\[citation\b/i.test(source)) return source;
  const tree = parser.parse(source);
  const blocked: [number, number][] = [];
  visit(tree, (node) => {
    if (
      [
        "code",
        "inlineCode",
        "html",
        "link",
        "linkReference",
        "image",
        "definition",
      ].includes(node.type) &&
      node.position
    )
      blocked.push([node.position.start.offset!, node.position.end.offset!]);
  });
  return source.replace(
    pairPattern,
    (whole: string, raw: string, label: string, offset: number) => {
      if (
        blocked.some(
          ([start, end]) =>
            (offset >= start && offset < end) ||
            (offset + whole.length - 11 >= start &&
              offset + whole.length - 11 < end),
        ) ||
        /(?:^|[^\\])(?:\\\\)*\\$/.test(source.slice(0, offset)) ||
        /\[\/?Citation\b/i.test(label)
      )
        return whole;
      if (/\\$/.test(label)) return whole;
      const attrs = attributes(raw);
      if (!citationURL(attrs.url || "")) return whole;
      attrs.quote ||= plain(parser.parse(label));
      const encoded = Object.entries(attrs)
        .map(
          ([key, value]) =>
            `${key}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r?\n/g, " ")}"`,
        )
        .join(" ");
      return `:citation[${label}]{${encoded}}`;
    },
  );
}
