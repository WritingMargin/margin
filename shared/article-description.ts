import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import { expandContentTags } from "./content-tags";
import { expandCitations } from "./citations";
import fontMarkup from "./font-markup";

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(fontMarkup);
type TextNode = { type: string; value?: string; children?: TextNode[] };
const boundaries = new Set([
  "paragraph",
  "heading",
  "listItem",
  "tableCell",
  "tableRow",
  "blockquote",
  "containerDirective",
]);

function readableText(node: TextNode): string {
  if (["html", "definition", "image", "imageReference"].includes(node.type))
    return "";
  if (node.type === "break") return " ";
  if (node.type === "code") return `${node.value || ""} `;
  if (node.value !== undefined) return node.value;
  const text = (node.children || []).map(readableText).join("");
  return boundaries.has(node.type) ? `${text} ` : text;
}

export function articleDescription(content: string, title: string): string {
  const source = expandCitations(expandContentTags(content));
  const tree = parser.runSync(parser.parse(source), source);
  const text = readableText(tree).replace(/\s+/gu, " ").trim();
  if (!text) return title;
  const characters = [...text];
  if (characters.length <= 320) return text;
  let end = 319;
  for (let index = end; index >= 240; index--) {
    if (/\s/u.test(characters[index])) {
      end = index;
      break;
    }
  }
  return `${characters.slice(0, end).join("").trim()}…`;
}
