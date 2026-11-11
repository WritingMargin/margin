import assert from "node:assert/strict";
import test from "node:test";
import { applyHeading } from "./editor/headings";
test("heading choice changes the current line without splitting it or duplicating markers", () => {
  assert.deepEqual(applyHeading("My title\nBody", 3, 3, 2), {
    content: "## My title\nBody",
    start: 6,
    end: 6,
  });
  assert.deepEqual(applyHeading("## My title\nBody", 6, 6, 4), {
    content: "#### My title\nBody",
    start: 8,
    end: 8,
  });
  assert.deepEqual(applyHeading("## My title", 0, 0, 0), {
    content: "My title",
    start: 0,
    end: 0,
  });
});
test("selected lines receive the chosen level while blank lines and following text remain intact", () => {
  const content = "First\n\n## Second\nBody";
  const result = applyHeading(content, 0, 17, 3);
  assert.equal(result.content, "### First\n\n### Second\nBody");
  assert.equal(result.content.slice(result.end), "Body");
  assert.equal(applyHeading("One\nTwo", 0, 4, 1).content, "# One\nTwo");
});
test("empty lines, heading-prefix carets, and H6 stay editable", () => {
  assert.deepEqual(applyHeading("\nBody", 0, 0, 6), {
    content: "###### \nBody",
    start: 7,
    end: 7,
  });
  assert.equal(applyHeading("### Title", 1, 1, 1).start, 2);
  assert.equal(applyHeading("Text\n", 5, 5, 2).content, "Text\n## ");
  assert.throws(() => applyHeading("Text", 0, 0, 7), RangeError);
});
