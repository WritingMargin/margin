import assert from "node:assert/strict";
import test from "node:test";
import { defaultTheme, type Post } from "../shared/types";
import { defaultHeroSection, homepageSectionsSchema, resolveHero, resolveTemplateValue, safeTemplateURL, selectTemplatePost } from "../shared/template-sections";
import { applySectionPreset, homepageTemplates, matchesPreset } from "../shared/design-presets";
import { localHomepage } from "../shared/homepage";

const post = (id: string, patch: Partial<Post> = {}): Post => ({ id, title: id, excerpt: `About ${id}`, status: "published", slug: id, createdAt: "2026-10-01", updatedAt: "2026-10-01", cover: "", tags: [], seo: {} as Post["seo"], ...patch });

test("bindings follow current publication and published content with deterministic fallbacks", () => {
  const theme = structuredClone(defaultTheme);
  const latest = post("latest", { createdAt: "2026-10-20" });
  const featured = post("featured", { featured: true });
  const privatePost = post("PRIVATE", { status: "draft", createdAt: "2026-10-23", featured: true });
  assert.equal(selectTemplatePost([privatePost, featured, latest], "latest")?.id, "latest");
  assert.equal(selectTemplatePost([privatePost, featured, latest], "featured")?.id, "featured");
  assert.equal(resolveTemplateValue({ bind: "content.title", fallback: "Coming soon" }, theme, privatePost), "Coming soon");
  assert.equal(resolveTemplateValue({ bind: "content.description", fallback: "Read more" }, theme, post("empty", { excerpt: "" })), "Read more");
  theme.name = "Renamed publication";
  assert.equal(resolveTemplateValue({ bind: "blog.title" }, theme), "Renamed publication");
  assert.equal(resolveTemplateValue("<strong>Literal text</strong>", theme), "<strong>Literal text</strong>");
  const hero = defaultHeroSection();
  hero.props.title = { bind: "content.title", fallback: "Coming soon" };
  hero.props.image = { bind: "content.cover" };
  const empty = resolveHero(hero, theme, [privatePost]);
  assert.equal(empty.title, "Coming soon");
  assert.equal(empty.image, "");
  const filtered = localHomepage([latest, featured, privatePost], 1, 2, "missing");
  assert.equal(resolveHero(hero, theme, filtered.heroPosts!).title, "latest");
});

test("component configurations round-trip bindings and reset cleanly when switching to legacy templates", () => {
  const preset = homepageTemplates.find(template => template.id === "cover-story")!;
  const selected = applySectionPreset(defaultTheme, "homepage", preset.design);
  assert.ok(homepageSectionsSchema.safeParse(selected.homepage.sections).success);
  // API JSON key ordering must not affect selected-template detection.
  assert.ok(matchesPreset({ sections: [{ props: { title: "Hello", source: "latest" } }] }, { sections: [{ props: { source: "latest", title: "Hello" } }] }));
  assert.equal(applySectionPreset(selected, "homepage", homepageTemplates[0].design).homepage.sections, undefined);
  assert.deepEqual(selected.article, defaultTheme.article);
});

test("bindings reject executable values, unknown components, invalid links and duplicate sections", () => {
  const hero = defaultHeroSection();
  const feed = { id: "stories", component: "post-feed" };
  for (const invalid of [
    [{ ...hero, component: "remote-script" }, feed],
    [{ ...hero, props: { ...hero.props, title: { bind: "owner.email" } } }, feed],
    [{ ...hero, props: { ...hero.props, image: { bind: "blog.title" } } }, feed],
    [{ ...hero, props: { ...hero.props, buttonHref: "javascript:alert(1)" } }, feed],
    [{ ...hero, props: { ...hero.props, image: { bind: "content.cover", fallback: "//evil.test/x" } } }, feed],
    [hero, { ...feed, id: "welcome" }], [hero], [hero, hero, feed],
  ]) assert.equal(homepageSectionsSchema.safeParse(invalid).success, false);
  for (const value of ["https:example.test", "http:/example.test", "javascript:alert(1)", "//evil.test", "/\\evil.test", "https://user:secret@example.test", "https://good.test/\nunsafe"]) assert.equal(safeTemplateURL(value), false);
  assert.ok(safeTemplateURL("#posts"));
  assert.ok(safeTemplateURL("/api/public/covers/1234", true));
});

test("hero videos validate supported players and retain legacy image behavior", () => {
  const theme = structuredClone(defaultTheme);
  const hero = defaultHeroSection();
  hero.variant = "image-background";
  hero.props.image = "https://example.test/cover.jpg";
  theme.homepage.artworkVideo = "/api/public/videos/00000000-0000-4000-8000-000000000001";
  assert.equal(resolveHero(hero, theme, []).image, hero.props.image);
  assert.equal(resolveHero(hero, theme, []).video, "");
  hero.props.mediaType = "video";
  assert.equal(resolveHero(hero, theme, []).video, theme.homepage.artworkVideo);
  assert.equal(resolveHero(hero, theme, []).image, "");
  assert.equal(resolveHero(hero, theme, []).variant, "split");
  const feed = { id: "stories", component: "post-feed" };
  for (const video of [theme.homepage.artworkVideo, "https://youtu.be/dQw4w9WgXcQ", "https://vimeo.com/1234", "https://cdn.example.test/film.mp4", "https://cdn.example.test/stream.m3u8"]) {
    assert.equal(homepageSectionsSchema.safeParse([{ ...hero, props: { ...hero.props, video } }, feed]).success, true);
  }
  for (const video of ["javascript:alert(1)", "https://evil.test/embed/123", "/api/public/videos/../secret", "https://user:password@example.test/file.mp4"]) {
    assert.equal(homepageSectionsSchema.safeParse([{ ...hero, props: { ...hero.props, video } }, feed]).success, false);
  }
  hero.props.video = "";
  assert.equal(resolveHero(hero, theme, []).video, "", "removing a video must not revive the upload fallback");
});
