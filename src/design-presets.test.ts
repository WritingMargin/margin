import assert from "node:assert/strict";
import test from "node:test";
import { applySectionPreset, articleTemplates, homepageTemplates, sectionColors } from "../shared/design-presets";
import { parseDesignConfig } from "../shared/design-config";
import { canUsePostTemplate, postTemplates } from "../shared/post-templates";
import { defaultTheme } from "../shared/types";

test("homepage and article presets compose without changing identity or the other section", () => {
  const original = structuredClone(defaultTheme);
  original.name = "My publication";
  original.logo = "https://example.com/logo.png";
  original.homepage.title = "My welcome";
  original.homepage.artworkImage = "https://example.com/art.png";
  original.comments.enabled = false;
  for (const home of homepageTemplates) {
    for (const article of articleTemplates) {
      const themedHome = applySectionPreset(original, "homepage", home.design);
      assert.deepEqual(themedHome.article, original.article);
      const both = applySectionPreset(themedHome, "article", article.design);
      assert.deepEqual(both.homepage, themedHome.homepage);
      assert.equal(both.name, original.name);
      assert.equal(both.logo, original.logo);
      assert.equal(both.homepage.title, original.homepage.title);
      assert.equal(both.homepage.artworkImage, original.homepage.artworkImage);
      assert.deepEqual(both.comments, original.comments);
      assert.equal(original.homepage.background, undefined);
      assert.equal(parseDesignConfig(JSON.stringify(both)).error, "");
    }
  }
});

test("templates preserve pagination and welcome content while changing layout", () => {
  for (const template of homepageTemplates) {
    const next = applySectionPreset(defaultTheme, "homepage", template.design);
    assert.equal(next.homepage.pageSize, defaultTheme.homepage.pageSize);
    assert.equal(next.homepage.pagination, defaultTheme.homepage.pagination);
    assert.equal(next.homepage.title, defaultTheme.homepage.title);
    assert.equal(next.homepage.description, defaultTheme.homepage.description);
    assert.deepEqual(next.article, defaultTheme.article);
    assert.deepEqual(next.comments, defaultTheme.comments);
    assert.equal(parseDesignConfig(JSON.stringify(next)).error, "");
  }
});

test("legacy colors remain inherited and section colors are validated", () => {
  const theme = { ...defaultTheme, background: "#123456", accent: "#abcdef" };
  assert.deepEqual(sectionColors(theme, "article"), { background: "#123456", text: theme.text, accent: "#abcdef" });
  for (const section of ["homepage", "article"] as const) {
    for (const key of ["background", "text", "accent"] as const) {
      const overridden = applySectionPreset(theme, section, { [key]: "#112233" });
      assert.equal(sectionColors(overridden, section)[key], "#112233");
      for (const value of ["red", "#fff", "url(example.com)", null]) {
        const invalid = { ...theme, [section]: { ...theme[section], [key]: value } };
        assert.equal(parseDesignConfig(JSON.stringify(invalid)).theme, null);
      }
    }
  }
});

test("starter templates are only available for new empty drafts", () => {
  assert.equal(canUsePostTemplate({ id: "", status: "draft", content: "" }), true);
  for (const template of postTemplates) {
    assert.equal(canUsePostTemplate({ id: "", status: "draft", content: template.content }), false);
  }
  assert.equal(canUsePostTemplate({ id: "saved", status: "draft", content: "" }), false);
  assert.equal(canUsePostTemplate({ id: "", status: "published", content: "" }), false);
  assert.equal(canUsePostTemplate({ id: "", status: "draft", content: "My writing" }), false);
});

test("layout configs support independent structures while legacy designs keep their shape", () => {
  const legacy = structuredClone(defaultTheme);
  delete legacy.homepage.heroLayout;
  delete legacy.article.headerLayout;
  assert.deepEqual(parseDesignConfig(JSON.stringify(legacy)).theme, legacy);
  const structures = new Set(homepageTemplates.map(template => `${template.design.layout}/${template.design.heroLayout}/${JSON.stringify(template.design.sections ?? [])}`));
  assert.equal(structures.size, homepageTemplates.length);
  assert.equal(new Set(articleTemplates.map(template => template.design.headerLayout)).size, articleTemplates.length);
  for (const [section, key] of [["homepage", "heroLayout"], ["article", "headerLayout"]] as const) {
    const invalid = structuredClone(defaultTheme);
    Object.assign(invalid[section], { [key]: "unknown" });
    assert.equal(parseDesignConfig(JSON.stringify(invalid)).theme, null);
  }
});

test("templates reset presentation choices without replacing publication content", () => {
  const custom = structuredClone(defaultTheme);
  Object.assign(custom.homepage, { showSearch: false, showFeatured: false, showPostCount: false, searchPosition: "below", cardStyle: "filled", gridColumns: "three" });
  Object.assign(custom.article, { measure: "wide", quoteStyle: "panel", headingFont: "oswald", bodySize: "large" });
  const legacyHome = { font: "serif" as const, layout: "list" as const };
  const home = applySectionPreset(custom, "homepage", legacyHome);
  assert.equal(home.homepage.showSearch, true);
  assert.equal(home.homepage.showFeatured, true);
  assert.equal(home.homepage.cardStyle, "classic");
  assert.equal(home.homepage.gridColumns, "two");
  assert.equal(home.homepage.title, custom.homepage.title);
  assert.deepEqual(home.article, custom.article);
  const article = applySectionPreset(custom, "article", { font: "sans" });
  assert.equal(article.article.headingFont, "sans");
  assert.equal(article.article.measure, "auto");
  assert.equal(article.article.quoteStyle, "border");
  assert.equal(article.article.bodySize, "small");
});

test("presentation and composition settings reject unsafe or unknown values", () => {
  const fields = {
    homepage: { headingFont: "missing", headingScale: "huge", spacing: "-1", cardStyle: "custom", imageRatio: "url(x)", gridColumns: 3, showNumbers: "false", showSearch: null, showTopicFilters: 0, showPostCount: "no", showFeedHeading: [], showFeatured: "false", searchPosition: "outside", featuredPosition: "anywhere" },
    article: { headingFont: "serif; color:red", bodySize: "100px", lineSpacing: 0, measure: "200vw", headingStyle: "custom", quoteStyle: "custom" },
  };
  for (const section of ["homepage", "article"] as const) {
    for (const [key, value] of Object.entries(fields[section])) {
      const invalid = structuredClone(defaultTheme);
      Object.assign(invalid[section], { [key]: value });
      assert.equal(parseDesignConfig(JSON.stringify(invalid)).theme, null, `${section}.${key}`);
    }
  }
});
