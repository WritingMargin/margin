import assert from "node:assert/strict";
import test from "node:test";
import {
  homepageQuery,
  localHomepage,
  paginationPages,
} from "../shared/homepage.ts";
import type { Post } from "../shared/types.ts";
const posts = Array.from(
  { length: 100 },
  (_, i) =>
    ({
      id: String(i),
      status: "published",
      tags: [i % 2 ? "Design" : "Writing"],
    }) as Post,
);
test("homepage pages contain ten items and filter the whole collection", () => {
  assert.deepEqual(
    localHomepage(posts, 10, 2, "").posts.map((p) => p.id),
    Array.from({ length: 10 }, (_, i) => String(i + 10)),
  );
  const filtered = localHomepage(posts, 10, 3, "Design");
  assert.equal(filtered.total, 50);
  assert.equal(filtered.posts[0].id, "41");
  assert.equal(localHomepage(posts, 7, 999, "").posts.length, 2);
  assert.equal(localHomepage([], 10, 3, "").page, 1);
  assert.equal(localHomepage(posts, 10, 2, ["Design", "Writing"]).total, 100);
  assert.deepEqual(localHomepage(posts, 10, 1, "").topTags, ["Design", "Writing"]);
});
test("load more accumulates batches and numbered links stay bounded", () => {
  assert.equal(localHomepage(posts, 10, 3, "", true).posts.length, 30);
  assert.deepEqual(paginationPages(1, 100), [1, 2, "gap", 100]);
  assert.deepEqual(paginationPages(5, 10), [1, "gap", 4, 5, 6, "gap", 10]);
  assert.equal(
    homepageQuery(2, " a phrase ", "A & B"),
    "page=2&q=a+phrase&tag=A+%26+B",
  );
  assert.equal(homepageQuery(2, "", ["Design", "Writing"]), "page=2&tag=Design&tag=Writing");
});

test("featured posts stay on every page without consuming regular page slots", () => {
  const source = posts.map((p, index) => ({ ...p, featured: index === 0 }));
  for (const page of [1, 2, 10]) {
    const result = localHomepage(source, 10, page, "");
    assert.deepEqual(result.featured?.map(p => p.id), ["0"]);
    assert.equal(result.total, 99);
    assert(!result.posts.some(p => p.featured));
  }
  const included = localHomepage(source, 10, 1, "", false, true);
  assert.equal(included.total, 100);
  assert(included.posts.some(p => p.featured));
  assert.equal(localHomepage(source, 10, 1, "Design").featured?.length, 0);
  assert.equal(localHomepage([{ ...source[0], status: "draft" }], 10, 1, "").featured?.length, 0);
  const more = localHomepage(source, 10, 3, "", true);
  assert.equal(more.posts.length, 30);
  assert.equal(more.featured?.length, 1);
});

test("preview search paginates matches while preserving hero content and topic choices", () => {
  const featured = { ...posts[0], featured: true };
  const privatePost = { ...posts[1], id: "private", status: "draft" } as Post;
  const source = [featured, ...posts.slice(1), privatePost];
  const matches = [featured, ...posts.slice(1, 14), privatePost];
  const result = localHomepage(matches, 5, 2, "", false, false, source);
  assert.equal(result.total, 13);
  assert.deepEqual(result.posts.map(post => post.id), ["6", "7", "8", "9", "10"]);
  assert.deepEqual(result.featured?.map(post => post.id), ["0"]);
  assert.equal(result.heroPosts?.length, 100);
  assert.deepEqual(result.tags, ["Design", "Writing"]);
  const empty = localHomepage([], 5, 1, "", false, false, source);
  assert.equal(empty.total, 0);
  assert.equal(empty.featured?.length, 0);
  assert.equal(empty.heroPosts?.length, 100);
  assert.deepEqual(empty.tags, result.tags);
  assert.equal(localHomepage(matches, 5, 1, "Design", false, true, source).total, 7);
});
