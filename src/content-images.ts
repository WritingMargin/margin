import type { Nodes } from "mdast";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { expandContentTags } from "../shared/content-tags";
import { safeMediaUrl } from "./media";

export type ContentImage = { url: string; alt: string };
const parser = unified().use(remarkParse).use(remarkDirective);

/** Parse the same image syntax as the article; code examples are never candidates. */
export function contentImages(content: string): ContentImage[] {
  const tree = parser.parse(expandContentTags(content));
  const definitions = new Map<string, string>();
  visit(tree, "definition", (node) => {
    definitions.set(node.identifier, node.url);
  });
  const images = new Map<string, ContentImage>();
  visit(tree, (node) => {
    const { url, alt } = imageCandidate(node, definitions);
    if (url && !images.has(url)) images.set(url, { url, alt });
  });
  return [...images.values()];
}

function imageCandidate(node: Nodes, definitions: Map<string, string>) {
  let source: unknown;
  let alt = "";
  if (node.type === "image") {
    source = node.url;
    alt = node.alt || "";
  } else if (node.type === "imageReference") {
    source = definitions.get(node.identifier);
    alt = node.alt || "";
  } else return directiveImage(node);
  const url = safeMediaUrl(source);
  return { url, alt };
}

function directiveImage(node: Nodes) {
  if (
    !["leafDirective", "textDirective", "containerDirective"].includes(
      node.type,
    )
  )
    return { url: "", alt: "" };
  const directive = node as Nodes & {
    name: string;
    attributes?: Record<string, string>;
  };
  if (directive.name !== "image") return { url: "", alt: "" };
  return {
    url: safeMediaUrl(directive.attributes?.src),
    alt: directive.attributes?.alt || directive.attributes?.caption || "",
  };
}
