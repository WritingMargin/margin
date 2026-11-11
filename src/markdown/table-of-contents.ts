import type { Element, Root, RootContent } from "hast";
import { visit } from "unist-util-visit";
import { contentsDesignStyle, type TableOfContentsDesign } from "../../shared/table-of-contents";
import type { Post } from "../../shared/types";

const element = (tagName: string, properties: Element["properties"], children: Element["children"]): Element => ({ type: "element", tagName, properties, children });
function headingText(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element") return "";
  if (node.tagName === "img") return String(node.properties.alt ?? "");
  return node.children.map(headingText).join("");
}

// Mirror sectionIDs.next in the Go article renderer. A change to an unrelated
// heading cannot invalidate links, and literal numeric suffixes remain unique.
function sectionID(title: string, used: Map<string, number>) {
  const words = title.replace(/[A-Z]/g, ch => ch.toLowerCase()).match(/[\p{L}\p{N}\p{M}]+/gu);
  const base = words ? `section-${words.join("-")}` : "section";
  let id = base;
  let suffix = used.get(base) ?? 0;
  while (used.has(id)) {
    id = `${base}-${++suffix}`;
  }
  used.set(base, Math.max(suffix, 1));
  used.set(id, 1);
  return id;
}

// Run after sanitization; only fixed markup and plain heading text are added.
export default function tableOfContents({ placement = "off", design = {} }: { placement?: Post["tableOfContents"]; design?: TableOfContentsDesign }) {
  return (tree: Root) => {
    const used = new Map<string, number>();
    const headings: { id: string; title: string; level: number }[] = [];
    visit(tree, "element", node => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const title = headingText(node).replace(/\s+/g, " ").trim();
      if (!title) return;
      const id = sectionID(title, used);
      node.properties.id = id;
      headings.push({ id, title, level: Number(node.tagName[1]) });
      node.children.push(element("a", {
        id: `article-section-${headings.length}`, className: ["section-permalink"],
        href: `#${id}`, ariaLabel: `Link to section: ${title}`,
      }, []));

    });
    const included = headings.filter(heading => heading.level <= (design.maxDepth ?? 6));
    if (placement === "off" || !included.length) return;
    const level = Math.min(...included.map(heading => heading.level));
    const links = included.map(heading => element("li", { className: [`toc-depth-${heading.level - level}`] }, [
      element("a", { href: `#${heading.id}` }, [{ type: "text", value: heading.title }]),
    ]));
    const nav = element("nav", { className: ["article-toc"], ariaLabel: "Table of contents", "data-style": design.style ?? "outlined", "data-numbered": String(design.numbered ?? false), "data-sticky": String(design.sticky ?? true) }, [
      ...(design.title === "" ? [] : [element("strong", {}, [{ type: "text", value: design.title ?? "On this page" }])]), element("ol", {}, links),
    ]);
    tree.children = [element("div", { className: ["article-toc-layout", `article-toc-${placement}`], style: contentsDesignStyle(design) }, [
      nav, element("div", { className: ["article-prose"] }, tree.children as Element["children"]),
    ])];
  };
}
