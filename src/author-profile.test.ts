import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { adminUrl, parseAdminRoute } from "./admin-route";

test("profile has a dedicated workspace route", () => {
  assert.deepEqual(parseAdminRoute("/admin/profile"), { view: "profile" });
  assert.equal(adminUrl({ view: "profile" }), "/admin/profile");
});

test("post byline places the optional photo before the author name", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".profile-test-"));
  try {
    const outfile = path.join(dir, "profile.mjs");
    await build({ entryPoints: ["src/blog/PostByline.tsx"], outfile, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic" });
    const { default: PostByline } = await import(pathToFileURL(outfile).href);
    const render = (name: string, image: string) => renderToStaticMarkup(createElement(PostByline, { byline: { name, image } }));
    assert.equal(render("", ""), "");
    assert.equal(render("", "https://example.com/image.png"), "");
    assert.equal(render("Alex Writer", ""), '<div class="post-byline"><span>By Alex Writer</span></div>');
    assert.match(render("Alex Writer", "https://example.com/image.png"), /<img[^>]+alt=""[^>]+width="32"[^>]*><span>By Alex Writer<\/span>/);
    assert.doesNotMatch(render("Alex Writer", "javascript:alert(1)"), /<img/);
    assert.match(render("<script>Writer</script>", ""), /&lt;script&gt;Writer&lt;\/script&gt;/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
