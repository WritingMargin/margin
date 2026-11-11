import assert from "node:assert/strict";
import test from "node:test";
import { activeContentsSection } from "./markdown/ContentsLayout.tsx";

test("reading marker follows section boundaries and the final short section", () => {
  const sections = [{ id: "first", top: -300 }, { id: "second", top: 130 }, { id: "third", top: 520 }];
  assert.equal(activeContentsSection(sections, 160), "second");
  assert.equal(activeContentsSection(sections, 100), "first");
  assert.equal(activeContentsSection(sections, 160, true), "third");
  assert.equal(activeContentsSection([{ id: "first", top: 400 }], 160), "first");
  assert.equal(activeContentsSection([], 160), "");
});
