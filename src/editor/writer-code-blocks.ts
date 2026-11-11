import { writerMarkdownBlocks } from "./writer-markdown-blocks";
import { writerEmbedLine } from "./writer-embed-blocks";
import { codeLanguageLabel } from "../../shared/code-languages";
import { contentTags, marker } from "../../shared/content-tags";

export type WriterCodeBlock = {
  from: number;
  to: number;
  body: number;
  label: string;
};
const descriptions: Record<string, string> = {
  carousel: "Image carousel",
  mermaid: "Diagram",
  chart: "Chart",
  scene: "3D scene",
  illustration: "Illustration",
  poll: "Poll",
  ipynb: "Jupyter notebook",
};
function description(language: string, body: string) {
  if (language === "ipynb") {
    try {
      const notebook = JSON.parse(body);
      if (Array.isArray(notebook.cells))
        return `Jupyter notebook · ${notebook.cells.length} ${notebook.cells.length === 1 ? "cell" : "cells"}`;
    } catch {
      /* Incomplete notebook JSON can still be edited. */
    }
  }
  return descriptions[language] || `${codeLanguageLabel(language)} code`;
}
function opening(line: string) {
  const fence = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
  if (fence)
    return {
      fence: fence[1],
      language: fence[2].trim().split(/\s/)[0].toLowerCase(),
      tag: "",
    };
  const tag = marker(line);
  if (
    !tag ||
    tag.close ||
    (contentTags[tag.tag].kind !== "raw" && tag.tag !== "Carousel")
  )
    return null;
  return { fence: "", language: contentTags[tag.tag].target, tag: tag.tag };
}
function closes(line: string, start: NonNullable<ReturnType<typeof opening>>) {
  if (start.tag) {
    const tag = marker(line);
    return tag?.close && tag.tag === start.tag;
  }
  const fence = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
  return (
    !!fence &&
    fence[1][0] === start.fence[0] &&
    fence[1].length >= start.fence.length
  );
}
/** Only complete, standalone blocks fold; unfinished source remains editable. */
export function writerCodeBlocks(source: string): WriterCodeBlock[] {
  const lines = source.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const markdown = new Map(
    writerMarkdownBlocks(source).map((block) => [block.from, block]),
  );
  const blocks: WriterCodeBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const code = markdown.get(offsets[i]);
    if (code) {
      blocks.push({ ...code, label: description(code.language, code.value) });
      i = finalCodeLine(i, offsets, code.to);
      continue;
    }
    const line = lines[i].replace(/\r$/, "");
    const embed = writerEmbedLine(line, offsets[i]);
    if (embed) {
      blocks.push(embed);
      continue;
    }
    const start = opening(line);
    if (!start) continue;
    let end = i + 1;
    while (end < lines.length && !closes(lines[end].replace(/\r$/, ""), start))
      end++;
    if (end === lines.length) break;
    const body = lines.slice(i + 1, end).join("\n");
    blocks.push({
      from: offsets[i],
      to: offsets[end] + lines[end].length,
      body: offsets[i + 1],
      label: description(start.language, body),
    });
    i = end;
  }
  return blocks;
}

function finalCodeLine(index: number, offsets: number[], to: number) {
  while (index + 1 < offsets.length && offsets[index + 1] < to) index++;
  return index;
}
