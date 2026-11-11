import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ClassificationConfig } from "./analytics/ClassificationControls";

test("classification action requires eligible articles and explains empty states", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".classifier-test-"));
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({
      stdin: {
        contents:
          'export { ClassificationAction } from "./src/analytics/ClassificationControls";',
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      loader: { ".css": "empty" },
      outfile,
      jsx: "automatic",
      define: { "import.meta.env": JSON.stringify({ BASE_URL: "/" }) },
    });
    const { ClassificationAction } = await import(pathToFileURL(outfile).href);
    const render = (config: ClassificationConfig) =>
      renderToStaticMarkup(
        createElement(ClassificationAction, {
          config,
          running: false,
          classify: () => {},
        }),
      );
    const eligible: ClassificationConfig = {
      available: true,
      connected: true,
      cost: 1,
      published: 1,
      pending: 1,
      queue: [{ id: "article", title: "Article", revision: "one" }],
    };
    assert.match(render(eligible), /<button/);
    for (const config of [
      { ...eligible, published: 0, pending: 0, queue: [] },
      { ...eligible, published: 0 },
      { ...eligible, pending: 0, queue: [] },
      { ...eligible, queue: [] },
      { ...eligible, available: false },
    ])
      assert.doesNotMatch(render(config), /<button/);
    assert.match(
      render({ ...eligible, published: 0, pending: 0, queue: [] }),
      /No published articles/,
    );
    assert.match(
      render({ ...eligible, pending: 0, queue: [] }),
      /already classified/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
