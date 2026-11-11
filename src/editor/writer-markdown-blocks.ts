import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
const parser = unified().use(remarkParse);
export type MarkdownCodeRange = {
  from: number;
  to: number;
  body: number;
  language: string;
  value: string;
};
export function writerMarkdownBlocks(source: string): MarkdownCodeRange[] {
  const blocks: MarkdownCodeRange[] = [];
  visit(parser.parse(source), "code", (node) => {
    if (!node.position) return;
    const start = node.position.start.offset!;
    const to = node.position.end.offset!;
    const original = source.slice(start, to);
    const fence = /^(`{3,}|~{3,})/.exec(original);
    if (fence && !completeFence(original, fence[1])) return;
    const from = source.lastIndexOf("\n", start - 1) + 1;
    blocks.push({
      from,
      to,
      body: fence ? source.indexOf("\n", start) + 1 : from,
      language: node.lang || "",
      value: node.value,
    });
  });
  return blocks;
}
function completeFence(source: string, fence: string) {
  const last = source
    .slice(source.lastIndexOf("\n") + 1)
    .replace(/^[ >\t]*/, "")
    .trimEnd();
  return (
    last.length >= fence.length &&
    Array.from(last).every((char) => char === fence[0]) &&
    source.includes("\n")
  );
}
