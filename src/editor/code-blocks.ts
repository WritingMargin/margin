import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
const parser = unified().use(remarkParse);
export type CodeSelection = {
  start: number;
  end: number;
  source: string;
  language: string;
  meta: string;
  existing: boolean;
  original: string;
  document: string;
  error?: string;
};
export function selectedCode(
  content: string,
  start: number,
  end: number,
): CodeSelection {
  const tree = parser.parse(content);
  let nested = false;
  visit(tree, "code", (node, _index, parent) => {
    if (
      parent?.type !== "root" &&
      (node.position?.start.offset ?? Infinity) <= start &&
      (node.position?.end.offset ?? -1) >= end
    )
      nested = true;
  });
  const node = tree.children.find(
    (node) =>
      node.type === "code" &&
      (node.position?.start.offset ?? Infinity) <= start &&
      (node.position?.end.offset ?? -1) >= end,
  );
  if (node?.type === "code" && node.position) {
    const offset = node.position.start.offset!;
    const from = offset > 0 ? content.lastIndexOf("\n", offset - 1) + 1 : 0;
    const to = node.position.end.offset!;
    const original = content.slice(from, to);
    return {
      start: from,
      end: to,
      source: node.value,
      language: node.lang || "auto",
      meta: node.meta || "",
      existing: true,
      original,
      document: content,
    };
  }
  return {
    start,
    end,
    source: content.slice(start, end),
    language: "auto",
    meta: "",
    existing: false,
    original: content.slice(start, end),
    document: content,
    error: nested
      ? "Edit code blocks inside lists or quotes directly in the writing area."
      : undefined,
  };
}
export function codeFence(source: string, language: string, meta = ""): string {
  // Longer fences let Markdown examples contain their own triple backticks.
  let longest = 2;
  for (const match of source.matchAll(/`+/g))
    longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(longest + 1);
  const info = [language, meta]
    .filter(Boolean)
    .join(" ")
    .replace(/[\r\n`]/g, "");
  return `${fence}${info}\n${source}\n${fence}`;
}
export function replaceCode(
  content: string,
  selection: CodeSelection,
  source: string,
  language: string,
) {
  if (selection.error) throw new Error(selection.error);
  if (content !== selection.document)
    throw new Error(
      "The article changed. Close this editor and open the code block again.",
    );
  const before = content.slice(0, selection.start),
    after = content.slice(selection.end);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
  const block = codeFence(source, language, selection.meta);
  const start = selection.start + prefix.length;
  return {
    content: before + prefix + block + suffix + after,
    start,
    end: start + block.length,
  };
}
