import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("React component templates render escaped bindings, mounted URLs and ordered sections", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".renderer-test-"));
  try {
    const outfile = path.join(dir, "components.mjs");
    await build({ stdin: { contents: 'export { BlogHomepage } from "./src/blog/BlogHomepage"; export { defaultTheme } from "./shared/types"; export { homepageTemplates, applySectionPreset } from "./shared/design-presets";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty", ".svg": "dataurl" }, outfile, jsx: "automatic", define: { "import.meta.env": JSON.stringify({ BASE_URL: "/blog/" }) } });
    const { BlogHomepage, defaultTheme, homepageTemplates, applySectionPreset } = await import(pathToFileURL(outfile).href);
    const theme = applySectionPreset(defaultTheme, "homepage", homepageTemplates.find((t: { id: string }) => t.id === "cover-story").design);
    const article = { id: "a", title: "<script>Title</script>", excerpt: "Actual excerpt", slug: "test-story", status: "published", tags: [], cover: "/api/public/covers/00000000-0000-4000-8000-000000000001", createdAt: "2026-10-23", featured: true };
    const privatePost = { ...article, id: "b", title: "PRIVATE", slug: "private", status: "draft", createdAt: "2026-10-24" };
    const render = () => renderToStaticMarkup(createElement(BlogHomepage, { theme, posts: [privatePost, article], preview: true }));
    theme.homepage.sectionSpacing = "none";
    const html = render();
    assert.match(html, /data-section-spacing="none"/);
    assert.match(html, /&lt;script&gt;Title&lt;\/script&gt;/);
    assert.doesNotMatch(html, /PRIVATE|<script>/);
    assert.match(html, /href="\/blog\/post\/test-story"/);
    assert.match(html, /src="\/blog\/api\/public\/covers\//);
    assert.ok(html.indexOf('class="template-hero ') < html.indexOf('id="posts"'));
    assert.ok(html.indexOf('id="posts"') < html.indexOf('class="featured-posts"'));
    const hero = theme.homepage.sections[0];
    hero.props.mediaType = "video";
    hero.props.video = "/api/public/videos/00000000-0000-4000-8000-000000000002";
    const videoHTML = render();
    assert.match(videoHTML, /template-hero-split with-image/);
    assert.match(videoHTML, /class="template-hero-video"/);
    assert.match(videoHTML, /src="\/blog\/api\/public\/videos\//);
    assert.match(videoHTML, /controls=""/);
    assert.doesNotMatch(videoHTML, /autoplay=""|class="template-hero-image"/);
    hero.props.video = "https://youtu.be/dQw4w9WgXcQ?autoplay=1";
    assert.match(render(), /src="https:\/\/www.youtube-nocookie.com\/embed\/dQw4w9WgXcQ"/);
    theme.homepage.sections = [theme.homepage.sections[1], theme.homepage.sections[0]];
    const moved = render();
    assert.ok(moved.indexOf('id="posts"') < moved.indexOf('class="template-hero '));
    assert.doesNotMatch(moved, /class="featured-posts"/);
    assert.match(moved, /class="journal-post"/); // Removing featured section must keep its posts discoverable.
  } finally { await rm(dir, { recursive: true, force: true }); }
});
