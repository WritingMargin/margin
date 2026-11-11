import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("creation and designer galleries use the selected content type", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".renderer-test-"));
  try {
    const outfile = path.join(dir, "authoring.mjs");
    await build({ stdin: { contents: 'export { default as EditorHeading } from "./src/admin/EditorHeading"; export { default as EditorFooter } from "./src/admin/EditorFooter"; export { default as NewContentMenu } from "./src/admin/NewContentMenu"; export { default as DesignPresets } from "./src/designer/DesignPresets"; export { emptyDraft } from "./src/admin/post-utils"; export { defaultTheme } from "./shared/types";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty", ".svg": "dataurl" }, outfile, jsx: "automatic", define: { "import.meta.env": JSON.stringify({ BASE_URL: "/" }) } });
    const { EditorHeading, EditorFooter, NewContentMenu, DesignPresets, emptyDraft, defaultTheme } = await import(pathToFileURL(outfile).href);
    const menu = renderToStaticMarkup(createElement(NewContentMenu, { publicationType: "blog", onCreate: () => {} }));
    assert.match(menu, /<summary[^>]*aria-label="More content types"/);
    for (const label of ["post", "guide"]) assert.ok(menu.includes(`New ${label}`));
    for (const [type, tableOfContents] of [["article", "off"], ["guide", "left"]]) {
      const draft = emptyDraft(type);
      assert.equal(draft.contentType, type);
      assert.equal(draft.tableOfContents, tableOfContents);
      assert.equal(draft.content, "");
      assert.equal(draft.status, "draft");
    }
    const editorState = { post: emptyDraft("guide"), theme: defaultTheme, storageConfigured: true, dirty: false, busy: false, localDraft: { status: "idle" }, conflicts: { baseline: { current: null } } };
    const heading = renderToStaticMarkup(createElement(EditorHeading, { state: editorState }));
    assert.match(heading, /aria-label="Guide title"/);
    assert.match(heading, /aria-label="Guide options"/);
    assert.match(renderToStaticMarkup(createElement(EditorFooter, { state: editorState })), /Publish guide/);
    assert.doesNotMatch(menu, /<strong>Doc<\/strong>/);
    const state = { local: defaultTheme, setLocal: () => {}, saving: false, uploadingLogo: false, config: { pending: false } };
    const gallery = (section: string) => renderToStaticMarkup(createElement(DesignPresets, { state, section }));
    const guide = gallery("guide");
    assert.match(guide, /Use Handbook template/);
    assert.doesNotMatch(guide, /Use Reference template|Use Knowledge base template|Use Research template/);
    assert.match(gallery("article"), /Use Essay template/);
    assert.match(guide, /Supports article · guide/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
