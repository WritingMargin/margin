import test from "node:test";
import assert from "node:assert/strict";
import { revisionFields, type PostRevision } from "../shared/revisions";

test("restoring a version selects article fields without changing its identity or publication state", () => {
  const old: PostRevision = {
    id: "post",
    author: { kind: "owner", name: "Writer" },
    previousRevision: null,
    revision: "old-token",
    version: 1,
    savedAt: "2026-10-14T12:00:00Z",
    title: "Old title",
    featured: true,
    tableOfContents: "left",
    contentType: "guide",
    slug: "old-slug",
    content: "Old words",
    excerpt: "Old excerpt",
    status: "draft",
    tags: ["one"],
    cover: "https://example.com/cover.jpg",
    seo: {
      title: "Search title",
      description: "Description",
      image: "https://example.com/og.jpg",
    },
    recommendations: { mode: "manual", postIds: ["related"] },
    createdAt: "then",
    updatedAt: "then",
  };
  const current = {
    ...old,
    revision: "current-token",
    status: "published",
    updatedAt: "now",
    ...revisionFields(old),
  };
  assert.equal(current.revision, "current-token");
  assert.equal(current.status, "published");
  assert.equal(current.updatedAt, "now");
  assert.deepEqual(
    Object.keys(revisionFields(old)).sort(),
    [
      "title",
      "slug",
      "excerpt",
      "content",
      "contentType",
      "tags",
      "cover",
      "coverMode",
      "seo",
      "recommendations",
      "featured",
      "tableOfContents",
    ].sort(),
  );
  assert.equal(revisionFields({ ...old, coverMode: "preview" }).coverMode, "preview");
  assert.equal(revisionFields(old).coverMode, "player");
  assert.equal(current.content, "Old words");
  assert.equal(current.contentType, "guide");
  assert.equal(revisionFields({ ...old, contentType: undefined }).contentType, "article");
  assert.equal(current.featured, true);
  assert.equal(current.tableOfContents, "left");
  assert.deepEqual(current.seo, old.seo);
});
