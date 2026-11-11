import assert from "node:assert/strict";
import test from "node:test";
import { parseDesignConfig, serializeDesignConfig } from "../shared/design-config";
import { defaultTheme } from "../shared/types";
import { applySectionPreset } from "../shared/design-presets";
import { bundledTemplateCatalog, parseTemplateCatalog } from "../shared/template-catalog";

test("contents design roundtrips through grouped JSON and template application", () => {
  const settings = { title: "Explore", style: "filled" as const, maxDepth: 3, width: 240, radius: 0, sticky: false, numbered: true, background: "#123456", text: "#ffffff", accent: "#abcdef" };
  const next = applySectionPreset(defaultTheme, "article", { tableOfContents: settings });
  assert.deepEqual(parseDesignConfig(serializeDesignConfig(next)).theme?.article.tableOfContents, settings);
  assert.equal(next.homepage, defaultTheme.homepage);
  assert.equal(applySectionPreset(next, "article", {}).article.tableOfContents, undefined);
  const catalog = structuredClone(bundledTemplateCatalog);
  catalog.content[0].designs.article!.tableOfContents = settings;
  assert.deepEqual(parseTemplateCatalog(catalog)?.content[0].designs.article?.tableOfContents, settings);
});

test("invalid contents settings fail the JSON contract", () => {
  for (const invalid of [null, { style: "custom" }, { width: 321 }, { width: 180.5 }, { sticky: "false" }, { maxDepth: 0 }, { radius: -1 }, { title: "x".repeat(81) }, { accent: "red;display:none" }, { unknown: true }]) {
    const theme = { ...defaultTheme, article: { ...defaultTheme.article, tableOfContents: invalid } };
    assert.equal(parseDesignConfig(JSON.stringify(theme)).theme, null);
  }
});
