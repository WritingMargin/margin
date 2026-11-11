import { z } from "zod";
import { defaultTheme } from "./types";

/** Maps the editor's grouped objects to the engine's established settings contract. */
type Group = { readonly [key: string]: string | Group };
const appearance = {
  colors: { background: "background", text: "text", accent: "accent" },
  typography: { font: "font", headingFont: "headingFont", headingSize: "headingScale" },
  width: "width", spacing: "spacing", border: { style: "border", radius: "radius" },
} as const;
export const designGroups = {
  publication: { type: "publicationType", name: "name", description: "description", logo: "logo" },
  style: { colors: { accent: "accent", background: "background", text: "text" }, media: { imageBorder: "imageBorder", videoBorder: "videoBorder" } },
  footer: { title: "footerTitle", logo: "showFooterLogo", description: "footerDescription", links: "footerLinks", style: { layout: "footerLayout", background: "footerBackground", text: "footerText", font: "footerFont" } },
  homepage: {
    hero: { layout: "heroLayout", title: "title", description: "description", tagline: { text: "tagline" }, artwork: { type: "artworkType", emoji: "artworkEmoji", image: "artworkImage", video: "artworkVideo" } },
    feed: { layout: "layout", heading: "showFeedHeading", count: "showPostCount", numbers: "showNumbers", columns: "gridColumns", topicFilters: "showTopicFilters", header: "feedHeader", filters: "feedFilters",
      cards: { style: "cardStyle", excerpts: "showExcerpts", dates: "showDates", topics: "showTags", image: { ratio: "imageRatio" } },
      pagination: { mode: "pagination", size: "pageSize" } },
    search: { position: "searchPosition" },
    featured: { position: "featuredPosition", includeInFeed: "includeFeaturedInFeed" },
    style: appearance,
    sections: "sections",
    sectionSpacing: "sectionSpacing",
  },
  article: {
    header: { layout: "headerLayout", cover: "showCover", excerpt: "showExcerpt", dates: "showDates", topics: "showTags" },
    tableOfContents: "tableOfContents",
    body: { size: "bodySize", lineSpacing: "lineSpacing", measure: "measure", headings: "headingStyle", quotes: "quoteStyle" },
    style: appearance,
  },
  guide: {
    header: { layout: "headerLayout", cover: "showCover", excerpt: "showExcerpt", dates: "showDates", topics: "showTags" },
    tableOfContents: "tableOfContents",
    body: { size: "bodySize", lineSpacing: "lineSpacing", measure: "measure", headings: "headingStyle", quotes: "quoteStyle" },
    style: appearance,
  },
  comments: {
    enabled: "enabled", layout: "layout", heading: "heading", introduction: "introduction",
    display: { initials: "showAvatars", dates: "showDates" },
    form: { button: "buttonLabel", name: "nameLabel", email: "emailLabel", body: "bodyLabel", placeholder: "placeholder" },
    style: { background: "background", border: { style: "border", radius: "radius" } },
  },
} as const satisfies Group;
/** These blocks are enabled by presence; omission always means off. */
export const optionalDesignBlocks = [
  { path: "footer.title", source: "showFooterTitle" },
  { path: "homepage.hero", source: "homepage.showHero" },
  { path: "homepage.hero.tagline", source: "homepage.showTagline" },
  { path: "homepage.hero.artwork", source: "homepage.showArtwork" },
  { path: "homepage.feed.cards.image", source: "homepage.showImages" },
  { path: "homepage.search", source: "homepage.showSearch" },
  { path: "homepage.featured", source: "homepage.showFeatured" },
  { path: "comments", source: "comments.visible" },
] as const;
const insideOptionalBlock = (path: string[]) => optionalDesignBlocks.some(block => path.join(".") === block.path || path.join(".").startsWith(block.path + "."));
const engineSections = new Set(["homepage", "article", "guide", "comments"]);
export type DesignFieldMapping = { path: string[]; source: string[] };
function walk(group: Group, path: string[], source: string[]): DesignFieldMapping[] {
  return Object.entries(group).flatMap(([key, value]) => {
    const scope = path.length === 0 && engineSections.has(key) ? [key] : source;
    return typeof value === "string" ? [{ path: [...path, key], source: [...scope, value] }] : walk(value, [...path, key], scope);
  });
}
export const designFieldMappings = walk(designGroups, [], []);
export function readDesignPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}
function writePath(target: Record<string, unknown>, path: string[], value: unknown) {
  let object = target;
  for (const key of path.slice(0, -1)) object = (object[key] ??= {}) as Record<string, unknown>;
  object[path.at(-1)!] = value;
}
function mapDesign(value: unknown, reverse: boolean): Record<string, unknown> {
  const result = {};
  for (const field of designFieldMappings) {
    const item = readDesignPath(value, reverse ? field.path : field.source);
    if (item !== undefined) writePath(result, reverse ? field.source : field.path, item);
  }
  return result;
}
export function groupDesign(theme: unknown): Record<string, unknown> {
  const result = mapDesign(theme, false);
  for (const block of optionalDesignBlocks) {
    const path = block.path.split(".");
    const parent = readDesignPath(result, path.slice(0, -1)) as Record<string, unknown> | undefined;
    if (!parent) continue;
    if (readDesignPath(theme, block.source.split(".")) === false) delete parent[path.at(-1)!];
    else parent[path.at(-1)!] ??= {};
  }
  return result;
}
export function ungroupDesign(config: unknown): Record<string, unknown> {
  const result = mapDesign(config, true);
  // Missing content in optional blocks uses the engine defaults; visibility comes only from presence.
  for (const field of designFieldMappings) {
    if (insideOptionalBlock(field.path) && readDesignPath(result, field.source) === undefined) {
      const value = readDesignPath(defaultTheme, field.source);
      if (value !== undefined) writePath(result, field.source, value);
    }
  }
  for (const block of optionalDesignBlocks) writePath(result, block.source.split("."), readDesignPath(config, block.path.split(".")) !== undefined);
  return result;
}
export const groupedPathFor = (path: string) => optionalDesignBlocks.find(block => block.source === path)?.path
  ?? designFieldMappings.find(field => field.source.join(".") === path)?.path.join(".") ?? path;

function groupedShape(group: Group, source: z.ZodRawShape, nested: Record<string, z.ZodRawShape>, path: string[]): z.ZodObject {
  const shape: Record<string, z.ZodRawShape[string]> = {};
  for (const [key, value] of Object.entries(group)) {
    const childPath = [...path, key];
    if (typeof value === "string") shape[key] = insideOptionalBlock(childPath) ? (source[value] as z.ZodType).optional() : source[value];
    else {
      const object = groupedShape(value, path.length === 0 && nested[key] ? nested[key] : source, nested, childPath);
      const optional = (path.length === 0 && key === "guide") || optionalDesignBlocks.some(block => block.path === childPath.join(".")) || object.safeParse({}).success;
      shape[key] = optional ? object.optional() : object;
    }
  }
  return z.strictObject(shape);
}
export function createGroupedDesignSchema(schema: z.ZodObject) {
  const nested = Object.fromEntries([...engineSections].map(key => [key, ((schema.shape[key] instanceof z.ZodOptional ? schema.shape[key].unwrap() : schema.shape[key]) as z.ZodObject).shape]));
  return groupedShape(designGroups, schema.shape, nested, []);
}

export const designGroupNotes: Record<string, string> = {
  publication: "Publication identity: name, description, type, and logo.",
  style: "Default colors and media borders for the publication.",
  "style.colors": "Publication colors inherited by sections without overrides.",
  "style.media": "Borders around content images and videos.",
  footer: "Footer content, links, and appearance across public pages.",
  "footer.title": "Publication title in the footer.",
  "footer.style": "Footer layout, colors, and typeface. Empty colors inherit the publication palette.",
  homepage: "Homepage structure, story feed, and appearance.",
  "homepage.hero": "Welcome section: layout, copy, tagline, and artwork.",
  "homepage.hero.tagline": "Short welcome label and its visibility.",
  "homepage.hero.artwork": "Logo, emoji, image, or playable video in the welcome section.",
  "homepage.feed": "Story arrangement, labels, cards, filters, and pagination.",
  "homepage.feed.cards": "Story card appearance and visible content.",
  "homepage.feed.cards.image": "Cover image visibility and proportions.",
  "homepage.feed.pagination": "Numbered pages or load more, and stories per page.",
  "homepage.search": "Search visibility and position relative to topic filters.",
  "homepage.featured": "Featured stories: visibility, position, and inclusion in the regular feed.",
  article: "Article opening, reading experience, and appearance.",
  "article.header": "Article opening layout and visible cover, summary, and metadata.",
  "article.body": "Reading width, text size, line spacing, headings, and quotes.",
  comments: "Conversation appearance, visibility, and form labels.",
  "comments.display": "Reader initials and dates on comments.",
  "comments.form": "Comment form labels, placeholder, and submit button.",
  "comments.style": "Comments background and borders.",
};
for (const section of ["homepage", "article", "guide"]) {
  designGroupNotes[`${section}.style`] = "Colors, typography, width, spacing, and borders for this section.";
  designGroupNotes[`${section}.style.colors`] = "Section color overrides. Omit to inherit publication colors.";
  designGroupNotes[`${section}.style.typography`] = "Body and heading typefaces, plus heading size.";
  designGroupNotes[`${section}.style.border`] = "Border strength and corner radius in pixels.";
}
designGroupNotes["comments.style.border"] = "Comment border strength and corner radius in pixels.";

for (const block of optionalDesignBlocks) designGroupNotes[block.path] += " Include this object to show it; omit it to hide it. {} uses default options.";

for (const section of ["guide"]) {
  designGroupNotes[section] = "Independent presentation for this content type. Omit to use its default design.";
  designGroupNotes[`${section}.header`] = designGroupNotes["article.header"];
  designGroupNotes[`${section}.body`] = designGroupNotes["article.body"];
}
