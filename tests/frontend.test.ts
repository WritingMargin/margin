import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { loadHome, loadArticle, loadNewsletter } from "../src/routes/content.ts";
import { publicMeta } from "../src/routes/meta.ts";
import { defaultTheme } from "../shared/types.ts";
import type { Post } from "../shared/types.ts";

const publicTheme = { ...defaultTheme, publicUrl: "https://journal.example", seo: { title: "", description: "", image: "", indexing: true, googleVerification: "" } };

const post: Post = {
  id: "public-post", title: "A public story", slug: "public-story", excerpt: "Introduction",
  content: "# Public content", tags: ["Web"], seo: { title: "", description: "", image: "" }, cover: "", status: "published",
  revision: "revision", createdAt: "2026-10-13T10:00:00.000Z", updatedAt: "2026-10-13T11:00:00.000Z",
};

const homepage = { posts: [post], page: 1, pageSize: 10, pages: 1, total: 1, tags: ["Web"], query: "", tag: "" };

test("static build contains an SPA shell and real local assets", async () => {
  const directory = path.resolve("dist/client");
  const html = await readFile(path.join(directory, "index.html"), "utf8");
  assert.match(html, /Opening the journal/);
  assert.match(html, /Enable JavaScript/);
  const assets = [...html.matchAll(/(?:src|href)="(?:\/__margin_runtime_base__)?(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(match => match[1]);
  assert(assets.length > 0);
  for (const asset of new Set(assets)) await access(path.join(directory, asset));
});

test("browser routes load public content directly from the same-origin Go API", async t => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    calls.push(url.pathname);
    assert.equal(url.origin, "https://journal.example");
    assert.equal(init.credentials, "same-origin");
    if (url.pathname.endsWith("/settings")) return Response.json(publicTheme);
    if (url.pathname.endsWith("/comments")) return Response.json([]);
    if (url.pathname.endsWith("/homepage")) return Response.json(homepage);
    return Response.json(post);
  });
  const home = await loadHome(new Request("https://journal.example/"));
  assert.deepEqual(home.homepage.posts, [post]);
  const article = await loadArticle(new Request("https://journal.example/post/public-story"), "public-story");
  assert.equal(article.post.content, post.content);
  assert.equal(article.canonical, "https://journal.example/post/public-story");
  assert.deepEqual(article.comments, []);
  assert(calls.every(value => value.startsWith("/api/public/")));
  assert(calls.includes("/api/public/posts/public-post/comments"));
});

test("unpublished article and invalid newsletter routes retain client error boundaries", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("Not found", { status: 404 }));
  await assert.rejects(loadArticle(new Request("https://journal.example/post/private"), "private"), error => error instanceof Response && error.status === 404);
  await assert.rejects(loadNewsletter(new Request("https://journal.example/newsletter/invalid"), "invalid"), error => error instanceof Response && error.status === 404);
});

test("newsletter browser routes load settings and preserve confirm/unsubscribe action", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json(publicTheme));
  for (const action of ["confirm", "unsubscribe"]) {
    const result = await loadNewsletter(new Request(`https://journal.example/newsletter/${action}?token=private`), action);
    assert.equal(result.newsletterAction, action);
    assert.deepEqual(result.theme, publicTheme);
  }
});

test("article metadata exposes canonical Markdown discovery", () => {
  const metadata = publicMeta(publicTheme, "https://journal.example/post/public-story", post);
  assert(metadata.some(entry => "type" in entry && entry.type === "text/markdown" && entry.href === "https://journal.example/posts/public-story.md"));
});

test("public metadata applies SEO settings without replacing article metadata", () => {
  const theme = { ...publicTheme, seo: { title: "Notes on making", description: "A custom description", image: "https://images.example/share.png", indexing: false, googleVerification: "token_123" } };
  const home = publicMeta(theme, theme.publicUrl);
  assert(home.some(item => "title" in item && item.title === theme.seo.title));
  assert(home.some(item => "name" in item && item.name === "robots" && item.content === "noindex, nofollow"));
  assert(home.some(item => "name" in item && item.name === "google-site-verification" && item.content === "token_123"));
  const article = publicMeta(theme, `${theme.publicUrl}/post/public-story`, { ...post, seo: { title: "", description: "", image: "" }, cover: "/api/public/covers/cover.png" });
  assert(article.some(item => "title" in item && item.title === `${post.title} — ${theme.name}`));
  assert(article.some(item => "property" in item && item.property === "og:image" && item.content === `${theme.publicUrl}/api/public/covers/cover.png`));
});

test("browser canonical URLs use the configured publication domain", async t => {
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    assert.equal(url.origin, "https://deployment.example");
    return Response.json(url.pathname.endsWith("/settings") ? publicTheme : homepage);
  });
  const home = await loadHome(new Request("https://deployment.example/"));
  assert.equal(home.canonical, "https://journal.example/");
});

test("post SEO controls search and social tags independently of visible content", () => {
  const customized = { ...post, cover: "https://images.example/cover.png", seo: { title: "Search-only title", description: "Search-only description", image: "https://images.example/og.png" } };
  const metadata = publicMeta(publicTheme, `${publicTheme.publicUrl}/post/${post.slug}`, customized);
  assert(metadata.some(item => "title" in item && item.title === customized.seo.title));
  for (const name of ["description", "twitter:description"]) assert(metadata.some(item => "name" in item && item.name === name && item.content === customized.seo.description));
  assert(metadata.some(item => "property" in item && item.property === "og:image" && item.content === customized.seo.image));
  assert(metadata.some(item => "name" in item && item.name === "twitter:image" && item.content === customized.seo.image));
  assert.equal(customized.title, post.title);
  assert.equal(customized.excerpt, post.excerpt);
});
