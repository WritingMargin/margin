import { z } from "zod";
import assert from "node:assert/strict";
import test from "node:test";
import { designSchema, parseDesignConfig, serializeDesignConfig } from "../shared/design-config";
import { designFieldMappings, groupDesign, optionalDesignBlocks, ungroupDesign } from "../shared/design-groups";
import { defaultHeroSection } from "../shared/template-sections";
import { defaultTheme } from "../shared/types";

test("every engine field has exactly one grouped path", () => {
  const sections = ["homepage", "article", "guide", "comments"] as const;
  const expected = Object.keys(designSchema.shape).filter(key => !sections.includes(key as typeof sections[number]));
  for (const key of sections) expected.push(...Object.keys((designSchema.shape[key] instanceof z.ZodOptional ? designSchema.shape[key].unwrap() : designSchema.shape[key]).shape).map(field => `${key}.${field}`));
  assert.deepEqual([...designFieldMappings.map(field => field.source.join(".")), ...optionalDesignBlocks.map(block => block.source)].sort(), expected.sort());
  assert.equal(new Set(designFieldMappings.map(field => field.path.join("."))).size, expected.length - optionalDesignBlocks.length);
  const sentinel: Record<string, unknown> = Object.fromEntries(Object.keys(designSchema.shape).map(key => [key, key]));
  for (const key of sections) sentinel[key] = Object.fromEntries(Object.keys((designSchema.shape[key] instanceof z.ZodOptional ? designSchema.shape[key].unwrap() : designSchema.shape[key]).shape).map(field => [field, `${key}.${field}`]));
  const normalized = ungroupDesign(groupDesign(sentinel));
  for (const field of designFieldMappings) {
    const read = (value: unknown) => field.source.reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], value);
    assert.deepEqual(read(normalized), read(sentinel));
  }
});

test("grouped JSON preserves required and optional values including component bindings", () => {
  const theme = structuredClone(defaultTheme);
  Object.assign(theme.homepage, { showSearch: true, searchPosition: "below", showPostCount: false, showFeatured: true, gridColumns: "three", sections: [
    { ...defaultHeroSection(), variant: "centered", props: { ...defaultHeroSection().props, title: { bind: "blog.title", fallback: "Hello" } } },
    { id: "stories", component: "post-feed" },
  ] });
  Object.assign(theme.article, { bodySize: "large", headingFont: "playfair", background: "#112233" });
  Object.assign(theme, { showFooterLogo: true, footerDescription: "A place for ideas.", footerLinks: [{ label: "About", url: "/post/about" }], footerLayout: "centered" });
  assert.deepEqual(parseDesignConfig(serializeDesignConfig(theme)), { theme, error: "" });
  assert.deepEqual(parseDesignConfig(serializeDesignConfig(defaultTheme)), { theme: { ...defaultTheme, homepage: { ...defaultTheme.homepage, showSearch: true, showFeatured: true } }, error: "" });
});

test("nested edits map to the engine settings used by renderers", () => {
  const config = JSON.parse(serializeDesignConfig(defaultTheme));
  delete config.homepage.search;
  config.homepage.feed.count = false;
  config.homepage.feed.layout = "magazine";
  config.homepage.feed.pagination.size = 9;
  config.article.body = { size: "large", measure: "focused" };
  const result = parseDesignConfig(JSON.stringify(config));
  assert.equal(result.error, "");
  assert.equal(result.theme?.homepage.showSearch, false);
  assert.equal(result.theme?.homepage.showPostCount, false);
  assert.equal(result.theme?.homepage.layout, "magazine");
  assert.equal(result.theme?.homepage.pageSize, 9);
  assert.equal(result.theme?.article.bodySize, "large");
});

test("grouped validation rejects unknown, mixed, missing and invalid settings", () => {
  const config = JSON.parse(serializeDesignConfig(defaultTheme));
  config.homepage.feed.pagination.size = 101;
  assert.match(parseDesignConfig(JSON.stringify(config)).error, /^homepage.feed.pagination.size:/);
  config.homepage.feed.pagination.size = 10;
  config.homepage.showSearch = false;
  assert.equal(parseDesignConfig(JSON.stringify(config)).theme, null);
  delete config.homepage.showSearch;
  delete config.homepage.feed;
  assert.match(parseDesignConfig(JSON.stringify(config)).error, /^homepage.feed:/);
});

test("optional blocks are enabled by presence, with omitted blocks explicitly disabled", () => {
  const config = JSON.parse(serializeDesignConfig(defaultTheme));
  config.homepage.hero.artwork = { type: "emoji", emoji: "✳" };
  assert.equal(parseDesignConfig(JSON.stringify(config)).theme?.homepage.showArtwork, true);
  config.homepage.hero.artwork = {};
  assert.equal(parseDesignConfig(JSON.stringify(config)).theme?.homepage.artworkType, "logo");
  delete config.homepage.hero.artwork;
  delete config.homepage.hero.tagline;
  delete config.homepage.feed.cards.image;
  delete config.homepage.search;
  delete config.homepage.featured;
  delete config.footer.title;
  delete config.comments;
  const parsed = parseDesignConfig(JSON.stringify(config));
  assert.equal(parsed.error, "");
  assert.ok(parsed.theme);
  assert.equal(parsed.theme.homepage.showArtwork, false);
  assert.equal(parsed.theme.homepage.showTagline, false);
  assert.equal(parsed.theme.homepage.showImages, false);
  assert.equal(parsed.theme.homepage.showSearch, false);
  assert.equal(parsed.theme.homepage.showFeatured, false);
  assert.equal(parsed.theme.showFooterTitle, false);
  assert.deepEqual(parsed.theme.footerLinks, []);
  assert.equal(parsed.theme.comments.visible, false);
  const output = JSON.parse(serializeDesignConfig(parsed.theme!));
  assert.equal(output.homepage.hero.artwork, undefined);
  assert.equal(output.homepage.search, undefined);
  delete config.homepage.hero;
  assert.equal(parseDesignConfig(JSON.stringify(config)).theme?.homepage.showHero, false);
});

test("artwork visibility flags and non-object feature values are rejected", () => {
  for (const artwork of [false, null, { visible: false }, { type: "invalid" }]) {
    const config = JSON.parse(serializeDesignConfig(defaultTheme));
    config.homepage.hero.artwork = artwork;
    assert.equal(parseDesignConfig(JSON.stringify(config)).theme, null);
  }
});
