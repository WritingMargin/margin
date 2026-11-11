import type { Element, Root, RootContent } from "hast";
import { visit } from "unist-util-visit";
import type { ChecklistItem } from "../../shared/checklist";

function text(node: RootContent): string {
  if (node.type === "text") return node.value;
  if (node.type !== "element" || node.tagName === "ul" || node.tagName === "ol") return "";
  if (node.tagName === "img") return String(node.properties.alt ?? "");
  return node.children.map(text).join("");
}
function isChecklist(node: Element) {
  return Array.isArray(node.properties.className) && node.properties.className.includes("md-checklist");
}
// Annotate only sanitized task inputs, keeping rich labels and ordinary lists intact.
export default function checklists() {
  return (tree: Root) => visit(tree, "element", node => {
    if (!isChecklist(node)) return;
    const items: ChecklistItem[] = [];
    function walk(element: Element, label = "") {
      if (element !== node && isChecklist(element)) return;
      if (element.tagName === "li") label = text(element).replace(/\s+/g, " ").trim();
      if (element.tagName === "input" && element.properties.type === "checkbox") {
        element.properties.dataChecklistItem = items.length;
        element.properties.ariaLabel = label || `Checklist item ${items.length + 1}`;
        items.push({ label: String(element.properties.ariaLabel), checked: Boolean(element.properties.checked) });
      }
      for (const child of element.children) if (child.type === "element") walk(child, label);
    }
    walk(node);
    node.properties.dataChecklistItems = JSON.stringify(items);
    // Nested checklists are independently processed by the outer visitor.
  });
}
