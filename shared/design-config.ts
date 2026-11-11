import { heroVideoSchema } from "./template-sections";
import { tableOfContentsDesignSchema } from "./table-of-contents";
import { z } from "zod";
import { feedHeaderSchema, feedFiltersSchema } from "./feed-design";
import { homepageSectionsSchema } from "./template-sections";
import { fontIds } from "./typography";
import { validFooterURL } from "./footer";
import type { Theme } from "./types";
import { createGroupedDesignSchema, groupDesign, ungroupDesign } from "./design-groups";

const color = z.string().regex(/^#[a-fA-F0-9]{6}$/, "Use a six-digit hex color.");
const image = z.string().max(2048).refine((value) => {
  if (value === "" || /^\/api\/public\/logos\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}, "Use an HTTP(S) image URL or an uploaded logo path.");
const border = { border: z.enum(["subtle", "bold"]), radius: z.number().int().min(0).max(32) };
export const typographyFields = { headingFont: z.enum(fontIds).optional(), headingScale: z.enum(["standard", "compact", "display"]).optional(), spacing: z.enum(["standard", "compact", "airy"]).optional() };
export const homePresentationFields = { cardStyle: z.enum(["classic", "flat", "outlined", "filled"]).optional(), imageRatio: z.enum(["auto", "landscape", "square", "portrait"]).optional(), gridColumns: z.enum(["two", "three"]).optional(), showNumbers: z.boolean().optional() };
export const articlePresentationFields = { tableOfContents: tableOfContentsDesignSchema.optional(), bodySize: z.enum(["small", "regular", "large"]).optional(), lineSpacing: z.enum(["compact", "relaxed", "loose"]).optional(), measure: z.enum(["auto", "focused", "reading", "wide"]).optional(), headingStyle: z.enum(["plain", "ruled", "accent"]).optional(), quoteStyle: z.enum(["border", "pull", "panel"]).optional() };
const appearance = { ...border, ...typographyFields, font: z.enum(fontIds), width: z.enum(["narrow", "wide"]), background: color.optional(), text: color.optional(), accent: color.optional() };

export const contentDesignSchema = z.strictObject({
  ...appearance,
  ...articlePresentationFields,
  headerLayout: z.enum(["standard", "cover-first", "split", "centered"]).optional(),
  showDates: z.boolean(),
  showTags: z.boolean(),
  showCover: z.boolean(),
  showExcerpt: z.boolean(),
});

// Keep the editable design contract aligned with the settings API's validation.
export const designSchema = z.strictObject({
  publicationType: z.enum(["blog", "article", "research"]),
  footerTitle: z.string().trim().max(150),
  showFooterTitle: z.boolean(),
  showFooterLogo: z.boolean(),
  footerDescription: z.string().trim().max(500),
  footerLinks: z.array(z.strictObject({ label: z.string().trim().min(1).max(60), url: z.string().trim().max(2048).refine(validFooterURL, "Use an HTTP(S) URL or a path starting with /.") })).max(8),
  footerLayout: z.enum(["split", "stacked", "centered"]),
  footerBackground: z.union([z.literal(""), color]),
  footerText: z.union([z.literal(""), color]),
  footerFont: z.union([z.literal("inherit"), z.enum(fontIds)]),
  logo: image,
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500),
  accent: color,
  background: color,
  text: color,
  imageBorder: z.enum(["none", "subtle", "bold"]),
  videoBorder: z.enum(["none", "subtle", "bold"]),
  homepage: z.strictObject({
    feedHeader: feedHeaderSchema.optional(),
    feedFilters: feedFiltersSchema.optional(),
    sections: homepageSectionsSchema.optional(),
    sectionSpacing: z.enum(["none", "compact", "standard", "airy"]).optional(),
    ...appearance,
    ...homePresentationFields,
    showSearch: z.boolean().optional(),
    showTopicFilters: z.boolean().optional(),
    showPostCount: z.boolean().optional(),
    showFeedHeading: z.boolean().optional(),
    showFeatured: z.boolean().optional(),
    searchPosition: z.enum(["inline", "above", "below"]).optional(),
    featuredPosition: z.enum(["before", "after"]).optional(),
    pageSize: z.number().int().min(1).max(100),
    pagination: z.enum(["pages", "more"]),
    tagline: z.string().trim().max(150),
    showTagline: z.boolean(),
    title: z.string().max(200),
    description: z.string().max(1000),
    layout: z.enum(["list", "grid", "magazine"]),
    heroLayout: z.enum(["split", "centered", "sidebar"]).optional(),
    showHero: z.boolean(),
    showArtwork: z.boolean(),
    includeFeaturedInFeed: z.boolean(),
    artworkType: z.enum(["logo", "emoji", "image", "video"]),
    artworkEmoji: z.string().max(32),
    artworkImage: image,
    artworkVideo: heroVideoSchema.optional(),
    showExcerpts: z.boolean(),
    showImages: z.boolean(),
    showDates: z.boolean(),
    showTags: z.boolean(),
  }),
  article: contentDesignSchema,
  guide: contentDesignSchema.optional(),
  comments: z.strictObject({
    ...border,
    visible: z.boolean(),
    enabled: z.boolean(),
    layout: z.enum(["minimal", "cards"]),
    heading: z.string().max(150),
    introduction: z.string().max(1000),
    buttonLabel: z.string().trim().min(1).max(60),
    showAvatars: z.boolean(),
    showDates: z.boolean(),
    nameLabel: z.string().trim().min(1).max(80),
    emailLabel: z.string().trim().min(1).max(80),
    bodyLabel: z.string().trim().min(1).max(80),
    placeholder: z.string().max(500),
    background: color,
  }),
});

export const editorDesignSchema = createGroupedDesignSchema(designSchema);
export const serializeDesignConfig = (theme: Theme) => JSON.stringify(groupDesign(theme), null, 2);

function isGrouped(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return ["publication", "style", "footer"].some(key => Object.hasOwn(value, key));
}
export function parseDesignConfig(text: string): { theme: Theme | null; error: string } {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { return { theme: null, error: "Invalid JSON. Check quotes, commas, and closing brackets." }; }
  const grouped = isGrouped(value);
  const checked = grouped ? editorDesignSchema.safeParse(value) : designSchema.safeParse(value);
  if (!checked.success) {
    const issue = checked.error.issues[0];
    return { theme: null, error: `${issue.path.join(".") || "Design"}: ${issue.message}` };
  }
  const result = designSchema.safeParse(grouped ? ungroupDesign(checked.data) : checked.data);
  if (result.success) return { theme: result.data, error: "" };
  const issue = result.error.issues[0];
  return { theme: null, error: `${issue.path.join(".") || "Design"}: ${issue.message}` };
}
