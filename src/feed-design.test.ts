import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { feedHeaderSchema, feedFiltersSchema, feedSearchFirst, feedTopicLabel } from "../shared/feed-design";
import { defaultTheme } from "../shared/types";
import { parseDesignConfig, serializeDesignConfig } from "../shared/design-config";

const header = { title: "Latest writing", showArrow: false, border: "none", paddingBlock: 0, gap: 8 } as const;
const filters = { layout: "inline", mobileLayout: "stacked", border: "bottom", paddingBlock: 12, gap: 24,
  topics: { allLabel: "Everything", labels: { "unified-apps": "Unified apps" } },
  search: { placeholder: "Search the journal", position: "start", maxWidth: 240 } } as const;

test("feed options round-trip through grouped editor and storage config without changing visibility", () => {
  const theme = structuredClone(defaultTheme);
  Object.assign(theme.homepage, { feedHeader: header, feedFilters: filters, showSearch: false, showFeatured: true });
  const grouped = JSON.parse(serializeDesignConfig(theme));
  assert.deepEqual(grouped.homepage.feed.header, header);
  assert.deepEqual(grouped.homepage.feed.filters, filters);
  assert.equal(grouped.homepage.search, undefined);
  assert.deepEqual(parseDesignConfig(JSON.stringify(grouped)).theme, theme);
  assert.deepEqual(parseDesignConfig(JSON.stringify(theme)).theme, theme);
});

test("feed options reject unknown keys, invalid bounds and malformed nested values", () => {
  for (const value of [{ gap: -1 }, { paddingBlock: 81 }, { border: "custom" }, { title: "x".repeat(151) }, { showArrow: "false" }, { extra: true }]) assert.equal(feedHeaderSchema.safeParse(value).success, false);
  for (const value of [{ gap: 0.5 }, { layout: "absolute" }, { mobileLayout: "hidden" }, { topics: null }, { topics: { labels: { "": "Empty" } } }, { topics: { labels: { topic: 1 } } }, { search: { maxWidth: 801 } }, { search: { maxWidth: 159 } }, { search: { position: "outside" } }, { search: { placeholder: "x".repeat(151) } }]) assert.equal(feedFiltersSchema.safeParse(value).success, false);
  assert.equal(feedTopicLabel("constructor"), "constructor");
  assert.equal(feedTopicLabel("unified-apps", filters.topics.labels), "Unified apps");
  assert.equal(feedSearchFirst("above", filters), true);
  assert.equal(feedSearchFirst("below", filters), false);
  assert.equal(feedSearchFirst(undefined, undefined), false);
});

test("public feed renders labels, count and search order while retaining legacy visibility", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".renderer-test-"));
  try {
    const outfile = path.join(dir, "feed.mjs");
    await build({ stdin: { contents: 'export { default as Heading } from "./src/blog/HomepageHeading"; export { default as Filters } from "./src/blog/HomepageFilters";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, outfile, jsx: "automatic" });
    const { Heading, Filters } = await import(pathToFileURL(outfile).href);
    const design = { ...defaultTheme.homepage, feedHeader: header, feedFilters: filters };
    const state = { design, theme: defaultTheme, data: { total: 2 }, tags: ["unified-apps", "constructor"], topTags: ["unified-apps"], tagCounts: { "unified-apps": 2, constructor: 1 }, tag: "unified-apps", selectedTags: ["unified-apps"], search: "sdk", setSearch: () => {}, setTag: () => {}, setTags: () => {} };
    const heading = renderToStaticMarkup(createElement(Heading, { state }));
    assert.match(heading, /Latest writing/);
    assert.match(heading, /2 POSTS/);
    assert.match(heading, /--feed-padding:0px/);
    assert.doesNotMatch(heading, /<svg/);
    const html = renderToStaticMarkup(createElement(Filters, { state }));
    assert.match(html, /Unified apps/);
    assert.match(html, /Everything/);
    assert.match(html, /Search the journal/);
    assert.match(html, /max-width:240px/);
    assert.match(html, /data-feed-mobile-layout="stacked"/);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /Topics \(1\)/);
    assert.doesNotMatch(html, /<button[^>]*>constructor<\/button>/);
    assert.ok(html.indexOf('class="journal-search"') < html.indexOf('class="journal-tag-filters"'));
    const oldState = { ...state, search: "", tag: "", selectedTags: [], design: { ...defaultTheme.homepage } };
    assert.match(renderToStaticMarkup(createElement(Filters, { state: oldState })), /Find a post…/);
    assert.match(renderToStaticMarkup(createElement(Heading, { state: oldState })), /THE BLOG/);
    Object.assign(design, { showSearch: false, showTopicFilters: false, showFeedHeading: false, showPostCount: false });
    assert.equal(renderToStaticMarkup(createElement(Heading, { state })), "");
    const hidden = renderToStaticMarkup(createElement(Filters, { state }));
    assert.doesNotMatch(hidden, /journal-search|journal-tag-filters/);
    assert.match(hidden, /Clear filters/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
