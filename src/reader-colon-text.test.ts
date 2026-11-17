import test from "node:test";
import assert from "node:assert/strict";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import styledDirectives from "./markdown/directives";

type HastNode = { type: string; value?: string; tagName?: string; children?: HastNode[] };

/** The reader's directive handling, down to the HTML tree it renders. */
function render(markdown: string) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(styledDirectives).use(remarkRehype);
  const tree = processor.runSync(processor.parse(markdown)) as HastNode;
  let text = "";
  const tags: string[] = [];
  (function walk(node: HastNode) {
    if (node.type === "text") text += node.value;
    if (node.type === "element") tags.push(node.tagName!);
    node.children?.forEach(walk);
  })(tree);
  return { text: text.trim(), tags };
}

test("colons in ordinary prose stay as text for readers", () => {
  for (const prose of [
    "Meet at 10:30 tomorrow.",
    "See you at re:Invent and Note:this.",
    "Write to mailto:me@x.test today.",
    "Ratios like 3:2 and times like 9:05:30.",
  ]) {
    const { text, tags } = render(prose);
    assert.equal(text, prose);
    assert.deepEqual(tags.filter((tag) => tag !== "p" && tag !== "a"), [], prose);
  }
});

test("real inline directives still render", () => {
  assert.ok(render("Some :mark[highlighted] words.").tags.includes("mark"));
  assert.equal(render("Some :mark[highlighted] words.").text, "Some highlighted words.");
  // An unknown name written with a label or attributes keeps its old rendering.
  assert.equal(render("A :custom[label] here.").text, "A label here.");
});
