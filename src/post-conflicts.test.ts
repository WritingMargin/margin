import test from "node:test";
import assert from "node:assert/strict";
import { conflictFields, resolvedPost } from "../shared/post-conflicts";
import { textDiff } from "../shared/text-diff";
import type { Post } from "../shared/types";
const base: Post = {
  id: "post",
  revision: "r1",
  title: "Title",
  slug: "title",
  content: "First\nSecond\nThird\n",
  excerpt: "",
  tags: [],
  cover: "",
  status: "draft",
  seo: { title: "", description: "", image: "" },
  recommendations: { mode: "automatic", postIds: [] },
  createdAt: "then",
  updatedAt: "then",
};
test("combines independent changes without dropping either writer's metadata", () => {
  const mine = { ...base, content: "My paragraph", featured: true };
  const latest = {
    ...base,
    revision: "r2",
    title: "Agent title",
    seo: { ...base.seo, description: "Agent description" },
    status: "published" as const,
  };
  assert.equal(conflictFields(base, mine, latest).length, 0);
  const result = resolvedPost(base, mine, latest, {}, "");
  assert.equal(result.content, mine.content);
  assert.equal(result.featured, true);
  assert.equal(result.title, latest.title);
  assert.deepEqual(result.seo, latest.seo);
  assert.equal(result.revision, "r2");
  assert.equal(result.status, "published");
  assert.equal(base.content, "First\nSecond\nThird\n");
});
test("requires explicit choices for overlapping edits, including SEO fields", () => {
  const mine = {
    ...base,
    content: "Mine",
    seo: { ...base.seo, title: "Mine SEO" },
  };
  const latest = {
    ...base,
    revision: "r2",
    content: "Agent",
    seo: { ...base.seo, title: "Agent SEO" },
  };
  assert.deepEqual(
    conflictFields(base, mine, latest).map(([key]) => key),
    ["content", "seo.title"],
  );
  assert.throws(
    () => resolvedPost(base, mine, latest, { content: "mine" }, ""),
    /Review every/,
  );
  const result = resolvedPost(
    base,
    mine,
    latest,
    { content: "edited", "seo.title": "latest" },
    "Mine and agent combined",
  );
  assert.equal(result.content, "Mine and agent combined");
  assert.equal(result.seo.title, "Agent SEO");
  assert.equal(result.revision, "r2");
  assert.equal(mine.content, "Mine");
});
test("identical simultaneous changes do not require a conflict choice", () => {
  const same = { ...base, title: "Same title" };
  assert.equal(
    conflictFields(base, same, { ...same, revision: "r2" }).length,
    0,
  );
  assert.equal(
    resolvedPost(base, same, { ...same, revision: "r2" }, {}, "").title,
    "Same title",
  );
});
test("removals and additions have accurate line numbers and counts", () => {
  const diff = textDiff(base.content!, "First\nRevised\nThird\nExtra\n")!;
  assert.equal(diff.added, 2);
  assert.equal(diff.removed, 1);
  const rows = diff.hunks.flatMap((h) => h.rows);
  assert.deepEqual(
    rows.find((row) => row.kind === "removed"),
    { kind: "removed", text: "Second", oldLine: 2, newLine: null },
  );
  assert.deepEqual(
    rows.find((row) => row.text === "Extra"),
    { kind: "added", text: "Extra", oldLine: null, newLine: 4 },
  );
});
test("diffs preserve whitespace, empty documents and final-newline differences", () => {
  assert.equal(textDiff("same", "same")!.hunks.length, 0);
  assert.equal(textDiff("", "one\n")!.added, 1);
  assert.equal(textDiff("one\n", "")!.removed, 1);
  assert.ok(textDiff("one", "one\n")!.hunks.length);
  assert.ok(textDiff(" one\n", "one\n")!.hunks.length);
});

test("content type changes merge with independent server edits", () => {
  const mine = { ...base, contentType: "guide" as const };
  const latest = { ...base, revision: "r2", title: "Server title", contentType: "article" as const };
  assert.deepEqual(conflictFields(base, mine, latest), []);
  const merged = resolvedPost(base, mine, latest, {}, "");
  assert.equal(merged.contentType, "guide");
  assert.equal(merged.title, "Server title");
  assert.equal(conflictFields(base, { ...base, contentType: "article" }, base).length, 0);
});
