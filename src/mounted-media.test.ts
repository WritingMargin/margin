import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("uploaded images render through both validation passes under a blog mount", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".renderer-test-"));
  try {
    const outfile = path.join(dir, "media.mjs");
    await build({ stdin: { contents: 'export {default as Markdown} from "./src/Markdown"; export {safeMediaUrl} from "./src/media"; export {carouselMarkdown} from "./src/blocks/carousel";', resolveDir: process.cwd(), loader: "ts" }, outfile, bundle: true, format: "esm", platform: "node", packages: "external", jsx: "automatic", loader: { ".css": "empty" }, define: { "import.meta.env.BASE_URL": '"/blog/"' } });
    const { Markdown, safeMediaUrl, carouselMarkdown } = await import(pathToFileURL(outfile).href);
    const image = "/api/public/covers/12345678-1234-1234-1234-123456789abc";
    assert.equal(safeMediaUrl(image), `/blog${image}`);
    const preview = `${image}?preview=${"a".repeat(43)}`;
    assert.equal(safeMediaUrl(preview), `/blog${preview}`);
    assert.equal(safeMediaUrl(`${image}?preview=bad`), undefined);
    assert.equal(safeMediaUrl(safeMediaUrl(image)), `/blog${image}`);
    assert.equal(safeMediaUrl("/blog/api/private/key"), undefined);
    for (const content of [`[Image src="${image}" frame="plain"]`, `![Upload](${image})`, `[Image src="${preview}"]`, `![Preview](${preview})`]) {
      const html = renderToStaticMarkup(createElement(Markdown, { content }));
      assert.ok(html.includes(`src="/blog${content.includes("?preview=") ? preview : image}"`));
      assert.doesNotMatch(html, /Invalid image|\/blog\/blog/);
    }
    const video = "/api/public/videos/12345678-1234-1234-1234-123456789abc";
    for (const src of [video, `/blog${video}`]) {
      const html = renderToStaticMarkup(createElement(Markdown, { content: `[Video src="${src}" title="Native video"]` }));
      assert.match(html, new RegExp(`<video[^>]+src="/blog${video}"`));
      assert.doesNotMatch(html, /video-error|\/blog\/blog/);
    }
    for (const [src, player] of [
      ["https://youtu.be/aqz-KE-bpKQ", "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"],
      ["https://vimeo.com/123456", "https://player.vimeo.com/video/123456"],
      ["https://player.mux.com/abc123", "https://player.mux.com/abc123"],
    ]) {
      const html = renderToStaticMarkup(createElement(Markdown, { content: `[Video src="${src}"]` }));
      assert.ok(html.includes(`<iframe src="${player}"`), html);
      assert.doesNotMatch(html, /video-error|valid HTTP/);
    }
    for (const src of [video, "https://vimeo.com/123456"]) {
      for (const sticky of ["true", "false", "yes"]) {
        const html = renderToStaticMarkup(createElement(Markdown, { content: `[Video src="${src}" sticky="${sticky}" title="Follow along"]` }));
        assert.equal(html.includes('class="sticky-video-slot"'), sticky === "true");
        assert.equal(html.match(/data-media-id=/g)?.length, 1, "one actual player and analytics identity");
        assert.doesNotMatch(html, /autoplay=""/);
      }
    }
    assert.equal(safeMediaUrl(video), undefined, "video uploads must not become image sources");
    const slides = [image, image].map(src => ({ src, alt: "", caption: "" }));
    const carousel = carouselMarkdown(slides);
    assert.ok(carousel.includes(`src="${image}"`));
    assert.ok(!carousel.includes("/blog/"), "saved content must stay independent of the deployment path");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
