import assert from "node:assert/strict";
import test from "node:test";
import { defaultTheme, type Post } from "../shared/types";
import { homepageStructuredData, robotsDirective } from "../shared/seo";
import { publicMeta } from "./routes/meta";

const theme = {
  ...defaultTheme,
  publicUrl: "https://example.com/blog",
  seo: { title: "Our stories", description: "Ideas worth sharing", image: "https://example.com/share.png", indexing: true, googleVerification: "" },
};
const post: Post = {
  id: "example", title: "A story", slug: "a-story", excerpt: "A useful introduction", status: "published",
  tags: [], cover: "", seo: { title: "", description: "", image: "" }, createdAt: "2026-10-15", updatedAt: "2026-10-15",
};

test("homepage metadata includes linked website and collection entities with public URLs", () => {
  const canonical = `${theme.publicUrl}/`;
  const meta = publicMeta(theme, canonical);
  const graph = meta.find(item => "script:ld+json" in item);
  assert.deepEqual(graph, { "script:ld+json": homepageStructuredData(theme.name, theme.seo.title, theme.seo.description, canonical, theme.seo.image) });
  const data = homepageStructuredData(theme.name, theme.seo.title, theme.seo.description, canonical, "");
  assert.equal(data["@graph"][0]["@type"], "WebSite");
  assert.equal(data["@graph"][1]["@type"], "CollectionPage");
  assert.ok(!("image" in data["@graph"][0]));
  assert.ok(!("image" in data["@graph"][1]));
});

test("post robots directives are independent and the blog-wide restriction wins", () => {
  for (const [noindex, nofollow, expected] of [
    [false, false, ""], [true, false, "noindex, follow"],
    [false, true, "index, nofollow"], [true, true, "noindex, nofollow"],
  ] as const) {
    const seo = { ...post.seo, noindex, nofollow };
    assert.equal(robotsDirective(true, seo), expected);
    const meta = publicMeta(theme, `${theme.publicUrl}/post/a-story`, { ...post, seo });
    const robots = meta.filter(item => "name" in item && item.name === "robots");
    assert.deepEqual(robots, expected ? [{ name: "robots", content: expected }] : []);
    assert.equal(robotsDirective(false, seo), "noindex, nofollow");
  }
  assert.equal(robotsDirective(true, post.seo), "", "old posts retain their indexing behavior");
});

test("article schema remains separate from homepage JSON-LD", () => {
  for (const [publicationType, expected] of [["blog", "BlogPosting"], ["article", "Article"], ["research", "ScholarlyArticle"]] as const) {
    const meta = publicMeta({ ...theme, publicationType }, `${theme.publicUrl}/post/a-story`, post);
    const schemas = meta.filter(item => "script:ld+json" in item);
    assert.equal(schemas.length, 1);
    assert.equal((schemas[0] as { "script:ld+json": { "@type": string } })["script:ld+json"]["@type"], expected);
  }
});

test("empty article descriptions fall back consistently across metadata channels", () => {
  const article = {...post, excerpt: " \n", content: "## Welcome\n\nExplore **Fused** and build your first integration."};
  const meta = publicMeta(theme, `${theme.publicUrl}/post/a-story`, article);
  const description = "Welcome Explore Fused and build your first integration.";
  for (const tag of ["description", "og:description", "twitter:description"]) {
    assert.ok(meta.some(item => (("name" in item && item.name === tag) || ("property" in item && item.property === tag)) && "content" in item && item.content === description));
  }
  const schema = meta.find(item => "script:ld+json" in item) as {"script:ld+json": {description: string}};
  assert.equal(schema["script:ld+json"].description, description);
  assert.equal(article.excerpt, " \n");
  assert.equal(article.seo.description, "");
});

test("post structured data uses the public profile and omits an unset author image", () => {
  const authorProfile = { name: "Alex Writer", image: "" };
  const metadata = publicMeta({ ...theme, authorProfile }, "https://example.com/post/story", post);
  const schema = metadata.find(item => "script:ld+json" in item) as { "script:ld+json": { author: unknown } };
  assert.deepEqual(schema["script:ld+json"].author, { "@type": "Person", name: "Alex Writer" });
  const withImage = publicMeta({ ...theme, authorProfile: { ...authorProfile, image: "https://example.com/author.png" } }, "https://example.com/post/story", post);
  const imageSchema = withImage.find(item => "script:ld+json" in item) as { "script:ld+json": { author: { image: string } } };
  assert.equal(imageSchema["script:ld+json"].author.image, "https://example.com/author.png");
});
