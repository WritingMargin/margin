import assert from "node:assert/strict";
import test from "node:test";
import { articleDescription } from "../shared/article-description";
import { postMetadata } from "../shared/post-seo";
import type { Post } from "../shared/types";

test("article summaries use readable Markdown and omit HTML and link destinations", () => {
  assert.equal(articleDescription("## A story\n\nHello **world**, tea &amp; coffee. [Read more](https://example.test).", "Title"), "A story Hello world, tea & coffee. Read more.");
  assert.equal(articleDescription("[Callout]\nKeep this insight.\n[/Callout]\n\n<script>bad()</script>", "Title"), "Keep this insight.");
  assert.equal(articleDescription("![Cover](https://example.test/cover.png)", "An image story"), "An image story");
  assert.equal(articleDescription("", "An empty story"), "An empty story");
});

test("automatic descriptions are bounded without breaking Unicode", () => {
  for (const text of ["日本語😀".repeat(100), "words and ideas ".repeat(40)]) {
    const result = articleDescription(text, "Title");
    assert.ok([...result].length <= 320);
    assert.ok(result.endsWith("…"));
    assert.ok(!result.includes("\uFFFD"));
  }
  const short = "語".repeat(320);
  assert.equal(articleDescription(short, "Title"), short);
});

test("search previews prefer explicit descriptions then excerpts before article text", () => {
  const post = {title:"Title", excerpt:"Excerpt", seo:{title:"",description:"Search description",image:""}, content:"Body",cover:""} as Post;
  assert.equal(postMetadata(post, "Blog", "").description, "Search description");
  post.seo.description = " \n";
  assert.equal(postMetadata(post, "Blog", "").description, "Excerpt");
  post.excerpt = " \n";
  assert.equal(postMetadata(post, "Blog", "").description, "Body");
});
