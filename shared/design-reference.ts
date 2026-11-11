import { z } from "zod";
import { defaultContentDesigns } from "./content-types";
import { designSchema, editorDesignSchema } from "./design-config";
import { groupedPathFor, optionalDesignBlocks } from "./design-groups";
import { defaultTheme, type Theme, type SectionAppearance } from "./types";

type Notes<T> = { [K in keyof T]-?: string };
const appearance: Notes<SectionAppearance> = {
  font: "Body typeface. serif is Lora; sans is Inter. Other IDs name their bundled typeface.",
  headingFont: "Heading typeface. Omit to use this section’s font.",
  headingScale: "Heading size: compact, standard, or oversized (display). Omitted: standard.",
  spacing: "Space between sections and stories. Omitted: standard.",
  width: "Overall content width. Article reading measure can be set separately.",
  border: "Strength of dividers and borders.",
  radius: "Corner radius in pixels.",
  background: "Section background. Omit to inherit the publication background.",
  text: "Section text color. Omit to inherit the publication text color.",
  accent: "Section accent color. Omit to inherit the publication accent color.",
};
const publication: Notes<Omit<Theme, "homepage" | "article" | "guide" | "comments">> = {
  publicationType: "Changes publication wording: posts, articles, or papers.",
  name: "Publication name used in navigation and branding.",
  description: "Description of your publication.",
  logo: "Logo image. Use an HTTP(S) URL, an uploaded /api/public/logos/<UUID> path, or an empty string.",
  footerTitle: "Footer text. An empty string uses the publication name.",
  showFooterTitle: "Show the footer title.",
  showFooterLogo: "Show the publication logo beside the footer title.",
  footerDescription: "Optional plain-text footer description, up to 500 characters.",
  footerLinks: "Up to eight custom footer links with a label and HTTP(S) URL or publication-root path.",
  footerLayout: "Arrange the footer in split, stacked, or centered layout.",
  footerBackground: "Footer background. Empty inherits the publication background.",
  footerText: "Footer text color. Empty inherits the publication text color.",
  footerFont: "Footer typeface. inherit uses the page's default font.",
  accent: "Default accent color, unless a section overrides it.",
  background: "Default background color, unless a section overrides it.",
  text: "Default text color, unless a section overrides it.",
  imageBorder: "Border strength around content images.",
  videoBorder: "Border strength around content videos.",
};
const homepage: Notes<Theme["homepage"]> = {
  feedHeader: "Feed heading text, count arrow, borders, vertical padding (0–80px) and gap (0–64px). Heading/count visibility use the existing feed toggles. Omit to retain publication wording and spacing. The count follows the current search/topic filter.",
  feedFilters: "Filter row layout (inline/stacked), mobile layout (wrap/stacked), borders, padding and gap; topic allLabel and labels keyed by exact tag; search placeholder, start/end position and maxWidth (160–800px). Above/below search placement takes precedence. Omit to retain existing presentation.",
  sectionSpacing: "Space between homepage components. Omitted: standard.",
  sections: "Optional ordered components: hero, featured-posts, post-feed. Hero fields accept custom strings or {bind, fallback} values. Only published content is used; a post feed is required.",
  ...appearance,
  layout: "Story arrangement: editorial list, card grid, or magazine. Combine with any heroLayout.",
  heroLayout: "Welcome section: split across the top, centered masthead, or left sidebar. Omitted: split. Requires the hero object.",
  cardStyle: "Story frames: layout default (classic), no frame (flat), outlined, or filled. Omitted: classic.",
  imageRatio: "Cover proportions. auto follows the layout. Omitted: auto. Requires the image object.",
  gridColumns: "Desktop grid columns; smaller screens adapt automatically. Only used with layout: grid. Omitted: two.",
  showNumbers: "Number stories in list layout. Omitted: true.",
  showSearch: "Show the publication search bar. Omitted: true.",
  searchPosition: "Search beside topics (inline), full width above, or full width below. Requires the search object. Omitted: inline.",
  showTopicFilters: "Show the topic filter buttons. Omitted: true.",
  showPostCount: "Show the total post count beside the feed heading. Omitted: true; independent of showFeedHeading.",
  showFeedHeading: "Show the heading above the story feed. Omitted: true.",
  showFeatured: "Show the featured section. When false, featured stories remain in the main feed. Omitted: true.",
  featuredPosition: "Place featured stories before or after the main feed. Requires the featured object. Omitted: before.",
  includeFeaturedInFeed: "Also repeat featured stories in the regular feed when the featured section is visible.",
  pagination: "Numbered pages (pages) or a load more button (more).",
  pageSize: "Stories per page. Search and filters still cover the whole publication.",
  title: "Welcome headline. Used when the hero object is present.",
  description: "Welcome introduction. Used when the hero object is present.",
  tagline: "Short welcome label. Empty uses the publication’s default label.",
  showTagline: "Show the welcome tagline.",
  showHero: "Show the welcome section. Turn off for a feed-first homepage.",
  showArtwork: "Show the image, logo, emoji, or video within the welcome section.",
  artworkType: "Use your publication logo with a Margin fallback (logo), an emoji, a custom image, or a playable video. Requires the artwork object.",
  artworkVideo: "Video URL or uploaded /api/public/videos/<UUID> path. Used with artworkType: video. Videos play on request; save the design to publish uploads.",
  artworkEmoji: "Emoji artwork content. Used with artworkType: emoji.",
  artworkImage: "Artwork image. Use an HTTP(S) URL, an uploaded /api/public/logos/<UUID> path, or an empty string. Used with artworkType: image.",
  showExcerpts: "Show story summaries.",
  showImages: "Show story cover images or media badges.",
  showDates: "Show publication dates on stories.",
  showTags: "Show topic labels on stories; separate from showTopicFilters.",
};
const article: Notes<Theme["article"]> = {
  tableOfContents: "Contents panel: title, style (plain, outlined, filled), numbered, maxDepth (1–6), sticky, width (160–320px), radius (0–32px), and background/text/accent hex colours. Each post controls visibility and placement.",
  ...appearance,
  headerLayout: "Article opening: standard, cover first, split, or centered. Omitted: standard.",
  measure: "Body column: auto follows the opening; focused is 60 characters, reading is 72, wide uses the content width. Omitted: auto.",
  bodySize: "Body text: small is 15px, regular is 17px, large is 20px. Omitted: small.",
  lineSpacing: "Line height: compact is 1.6, relaxed is 1.8, loose is 1.95. Omitted: loose.",
  headingStyle: "Body headings: plain, underlined (ruled), or accent color. Omitted: plain.",
  quoteStyle: "Block quotes: side rule (border), large centered quote (pull), or shaded panel. Omitted: border.",
  showDates: "Show the article publication date.",
  showTags: "Show article topic labels.",
  showCover: "Show the article’s image, video, or audio cover.",
  showExcerpt: "Show the article summary beneath the title.",
};
const comments: Notes<Theme["comments"]> = {
  visible: "Show the comments section when enabled is also true. false hides existing comments and the form.",
  enabled: "Open comments when visible is also true. false hides the entire section. Manage participation and spam protection in Readers settings.",
  layout: "Minimal list or individual cards.",
  heading: "Comments section heading.",
  introduction: "Text introducing the conversation.",
  buttonLabel: "Submit button text.",
  showAvatars: "Show reader initials beside comments.",
  showDates: "Show comment dates.",
  nameLabel: "Name field label.",
  emailLabel: "Email field label.",
  bodyLabel: "Comment field label.",
  placeholder: "Placeholder text in the comment field.",
  border: appearance.border,
  radius: appearance.radius,
  background: "Comments section background color.",
};

// Read constraints from the same schema used by the JSON editor, not a second list of options.
export const designReferenceSchema = z.toJSONSchema(editorDesignSchema);
const legacyReferenceSchema = z.toJSONSchema(designSchema);
export const designReferenceGroups = [
  { key: "publication", title: "Publication", notes: publication, defaults: defaultTheme },
  { key: "homepage", title: "Homepage", notes: homepage, defaults: defaultTheme.homepage },
  { key: "article", title: "Articles", notes: article, defaults: defaultTheme.article },
  { key: "guide", title: "Guides", notes: article, defaults: defaultContentDesigns.guide },
  { key: "comments", title: "Comments", notes: comments, defaults: defaultTheme.comments },
] as const;

export type FieldSchema = {
  description?: string;
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: FieldSchema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  required?: string[];
  properties?: Record<string, FieldSchema>;
};
export function describeDesignValue(field: FieldSchema): string {
  if (field.anyOf) return field.anyOf.map(describeDesignValue).join(" · ");
  if (field.const !== undefined) return JSON.stringify(field.const);
  if (field.enum) return field.enum.map(value => JSON.stringify(value)).join(" · ");
  if (field.type === "boolean") return "true · false";
  if (field.type === "integer") return `Integer · ${field.minimum}–${field.maximum}`;
  if (field.pattern) return 'Six-digit hex color · "#245c4a"';
  if (field.maxLength !== undefined) return `Text · ${field.minLength ?? 0}–${field.maxLength} characters`;
  return String(field.type);
}
export const designReference = designReferenceGroups.map(group => {
  const root = legacyReferenceSchema as FieldSchema;
  const schema = group.key === "publication" ? root : root.properties![group.key];
  const defaults = Object.fromEntries(Object.entries(group.defaults));
  return {
    key: group.key,
    title: group.title,
    fields: Object.entries(group.notes).filter(([key]) => !optionalDesignBlocks.some(block => block.source === (group.key === "publication" ? key : `${group.key}.${key}`))).map(([key, description]) => ({
      path: groupedPathFor(group.key === "publication" ? key : `${group.key}.${key}`),
      description: description.replace(/\b[a-z]+[A-Z]\w*\b/g, name => groupedPathFor(group.key === "publication" ? name : `${group.key}.${name}`)),
      values: describeDesignValue(schema.properties![key]),
      required: schema.required?.includes(key) ?? false,
      initial: defaults[key],
    })),
  };
});
