import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("the writing pad and preview show a selected cover without changing article content", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".renderer-test-"));
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({
      stdin: {
        contents:
          'export { default as EditorCard } from "./src/admin/EditorCard"; export { default as CoverPicker } from "./src/media/CoverPicker"; export { defaultTheme } from "./shared/types"; export { galleryImageURL } from "./src/media/gallery-images";',
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      loader: { ".css": "empty", ".svg": "dataurl" },
      outfile,
      jsx: "automatic",
      define: { "import.meta.env": JSON.stringify({ BASE_URL: "/blog/" }) },
    });
    const { EditorCard, CoverPicker, defaultTheme, galleryImageURL } =
      await import(pathToFileURL(outfile).href);
    const cover = "/api/public/covers/00000000-0000-4000-8000-000000000001";
    const noop = () => {};
    const state = {
      post: {
        id: "post",
        title: "My story",
        content: "Article content stays unchanged.",
        cover,
      },
      theme: {
        ...defaultTheme,
        article: { ...defaultTheme.article, showCover: true },
      },
      mode: "split",
      setMode: noop,
      setView: noop,
      setModal: noop,
      openAI: noop,
      editor: { current: null },
      change: noop,
      insert: noop,
      writing: { format: noop, review: noop, session: { busy: false } },
    };
    const render = () =>
      renderToStaticMarkup(
        createElement(EditorCard, {
          state,
          formatting: { busy: false, proposal: null },
        }),
      );
    const html = render();
    assert.match(html, /alt="Selected article cover"/);
    assert.match(html, /class="preview-post-cover"/);
    assert.match(html, /src="\/blog\/api\/public\/covers\//);
    assert.match(html, />Change cover<\/button>/);
    assert.match(
      html,
      /<textarea[^>]*>Article content stays unchanged\.<\/textarea>/,
    );
    state.theme.article.showCover = false;
    assert.match(render(), /Hidden on the article by your design settings/);
    assert.doesNotMatch(render(), /class="preview-post-cover"/);
    state.post.cover = "";
    assert.doesNotMatch(
      render(),
      /class="writer-cover"|class="preview-post-cover"/,
    );
    state.post.cover = "javascript:alert(1)";
    assert.doesNotMatch(
      render(),
      /class="writer-cover"|class="preview-post-cover"/,
    );
    const picker = renderToStaticMarkup(
      createElement(CoverPicker, { content: "", value: cover, onChange: noop }),
    );
    assert.match(picker, /Change cover media/);
    assert.match(picker, /src="\/blog\/api\/public\/covers\//);
    const video = "/api/public/videos/00000000-0000-4000-8000-000000000001";
    state.post.cover = video;
    assert.match(render(), /Video cover/);
    assert.match(render(), /<video[^>]+src="\/blog\/api\/public\/videos\//);
    const videoPicker = renderToStaticMarkup(createElement(CoverPicker, { content: "", value: video, onChange: noop, initialSource: "video" }));
    assert.match(videoPicker, /Video URL/);
    assert.match(videoPicker, /Upload video/);
    assert.match(videoPicker, /Selected cover/);
    assert.equal(
      galleryImageURL({ public_id: "stored", secure_url: cover }),
      cover,
    );
    assert.equal(
      galleryImageURL({ public_id: "stored", secure_url: "/blog" + cover }),
      cover,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
