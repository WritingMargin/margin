import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contentDesign, contentTypeLabel, resolveContentType, themeForContentType } from "../shared/content-types";
import { parseDesignConfig, serializeDesignConfig } from "../shared/design-config";
import { applySectionPreset } from "../shared/design-presets";
import { bundledTemplateCatalog, contentTemplatesFor, parseTemplateCatalog, supportedContentTypes, writingTemplatesFor } from "../shared/template-catalog";
import { defaultTheme } from "../shared/types";

test("legacy articles and independent guide defaults select the correct presentation", () => {
  assert.equal(resolveContentType(undefined), "article");
  assert.equal(resolveContentType("doc"), "article");
  assert.equal(contentTypeLabel(undefined, "blog"), "Post");
  assert.equal(contentTypeLabel("guide", "blog"), "Guide");
  assert.equal(themeForContentType(defaultTheme, undefined), defaultTheme);
  const theme = { ...defaultTheme, article: { ...defaultTheme.article, font: "playfair" as const } };
  assert.equal(contentDesign(theme, "guide").font, "sans");
  assert.equal(themeForContentType(theme, "guide").article, contentDesign(theme, "guide"));
  assert.equal(theme.article.font, "playfair");
});

test("combination templates have distinct configs and apply only to their selected content type", () => {
  const catalog = bundledTemplateCatalog;
  assert.deepEqual(supportedContentTypes(catalog.content.find(item => item.id === "feature")!), ["article"]);
  assert.deepEqual(supportedContentTypes(catalog.content.find(item => item.id === "handbook")!), ["guide"]);
  assert.deepEqual(supportedContentTypes(catalog.content.find(item => item.id === "publication-suite")!), ["article", "guide"]);
  for (const type of ["guide"] as const) {
    assert.ok(!contentTemplatesFor(catalog, type).some(item => item.id === "feature"));
    for (const template of contentTemplatesFor(catalog, type)) {
      const themed = applySectionPreset(defaultTheme, type, template.design);
      assert.deepEqual(themed.article, defaultTheme.article);
      assert.deepEqual(themed.homepage, defaultTheme.homepage);
      const parsed = parseDesignConfig(serializeDesignConfig(themed));
      assert.equal(parsed.error, "");
      assert.deepEqual(parsed.theme?.[type], JSON.parse(JSON.stringify(themed[type])));
    }
  }
});

test("catalog rejects unknown content types, empty configs, invalid designs and compatibility metadata", () => {
  for (const designs of [{}, { video: {} }, { doc: bundledTemplateCatalog.content[0].designs.article }, { guide: { ...bundledTemplateCatalog.content[0].designs.article, font: "missing" } }]) {
    const value = structuredClone(bundledTemplateCatalog);
    Object.assign(value.content[0], { designs });
    assert.equal(parseTemplateCatalog(value), null);
  }
  for (const supportedContentTypes of [[], ["video"], ["doc"], ["guide", "guide"]]) {
    const value = structuredClone(bundledTemplateCatalog);
    Object.assign(value.writing[0], { supportedContentTypes });
    assert.equal(parseTemplateCatalog(value), null);
  }
});

test("Central v5 matches bundled defaults and v4 migration preserves article-only support", () => {
  const readCatalog = (name: string) => JSON.parse(readFileSync(new URL(`../margin-central/internal/central/${name}`, import.meta.url), "utf8"));
  assert.deepEqual(parseTemplateCatalog(readCatalog("templates.json")), bundledTemplateCatalog);
  const older = readCatalog("templates-v4.json");
  const migrated = parseTemplateCatalog(older);
  assert.ok(migrated);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(migrated.content[0].designs, { article: older.article[0].design });
  assert.ok(contentTemplatesFor(migrated, "guide").length > 0);
  assert.ok(writingTemplatesFor(migrated, "guide").some(item => item.id === "playbook"));
  assert.ok(!writingTemplatesFor(migrated, "guide").some(item => item.id === "essay"));
  older.article = Array.from({ length: 50 }, (_, index) => ({ ...older.article[0], id: `article-${index}` }));
  older.writing = Array.from({ length: 50 }, (_, index) => ({ ...older.writing[0], id: `writing-${index}` }));
  assert.ok(parseTemplateCatalog(older), "valid full v4 catalogs remain readable");
});
