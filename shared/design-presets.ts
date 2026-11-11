import { contentDesign } from "./content-types";
import type { ContentType } from "./types";
import { componentHomepageTemplates } from "./component-presets";
import type { ArticleDesign, HomepageDesign, SectionAppearance, Theme } from "./types";

export type DesignSurface = "homepage" | ContentType;
export type Palette = Pick<Theme, "background" | "text" | "accent">;
type HomeLayout = Pick<HomepageDesign, "sections" | "sectionSpacing" | "showSearch" | "showTopicFilters" | "showPostCount" | "showFeedHeading" | "showFeatured" | "searchPosition" | "featuredPosition" | "cardStyle" | "imageRatio" | "gridColumns" | "showNumbers" | "layout" | "heroLayout" | "showHero" | "showArtwork" | "showExcerpts" | "showImages" | "showDates" | "showTags">;
type ArticleLayout = Pick<ArticleDesign, "tableOfContents" | "bodySize" | "lineSpacing" | "measure" | "headingStyle" | "quoteStyle" | "headerLayout" | "showCover" | "showExcerpt" | "showDates" | "showTags">;
export type PageTemplate = { id: string; name: string; description: string; design: SectionAppearance & Palette & Partial<HomeLayout & ArticleLayout> };

export function sectionColors(theme: Theme, section: DesignSurface): Palette {
  const look = section === "homepage" ? theme.homepage : contentDesign(theme, section);
  return { background: look.background ?? theme.background, text: look.text ?? theme.text, accent: look.accent ?? theme.accent };
}

export const homepageTemplates: PageTemplate[] = [
  { id: "journal", name: "Journal", description: "A welcoming introduction and an editorial list of stories, set in a warm serif.", design: { showSearch: true, showTopicFilters: true, showPostCount: true, showFeedHeading: true, showFeatured: true, searchPosition: "inline", featuredPosition: "before", headingFont: "playfair", headingScale: "standard", spacing: "airy", cardStyle: "flat", imageRatio: "landscape", gridColumns: "two", showNumbers: true, font: "serif", background: "#ffffff", text: "#242424", accent: "#202020", width: "wide", border: "subtle", radius: 4, layout: "list", heroLayout: "split", showHero: true, showArtwork: true, showExcerpts: true, showImages: true, showDates: true, showTags: true } },
  { id: "magazine", name: "Magazine", description: "A lead story with an oversized image, followed by a two-column editorial feed.", design: { showSearch: true, showTopicFilters: true, showPostCount: false, showFeedHeading: false, showFeatured: true, searchPosition: "above", featuredPosition: "before", headingFont: "oswald", headingScale: "display", spacing: "standard", cardStyle: "flat", imageRatio: "landscape", gridColumns: "two", showNumbers: false, font: "dm-sans", background: "#f5f7fc", text: "#1d2939", accent: "#2457c5", width: "wide", border: "subtle", radius: 16, layout: "magazine", heroLayout: "split", showHero: false, showArtwork: false, showExcerpts: true, showImages: true, showDates: true, showTags: true } },
  { id: "notebook", name: "Notebook", description: "A personal introduction in the left column, with a compact index of notes alongside.", design: { showSearch: true, showTopicFilters: false, showPostCount: false, showFeedHeading: false, showFeatured: false, searchPosition: "above", featuredPosition: "before", headingFont: "plex-mono", headingScale: "compact", spacing: "compact", cardStyle: "flat", imageRatio: "auto", gridColumns: "two", showNumbers: true, font: "source-serif", background: "#f5f5ed", text: "#293b30", accent: "#396548", width: "wide", border: "subtle", radius: 0, layout: "list", heroLayout: "sidebar", showHero: true, showArtwork: false, showExcerpts: false, showImages: false, showDates: true, showTags: true } },
  { id: "midnight", name: "Midnight", description: "A centered, oversized masthead above a grid of stories on a dark canvas.", design: { showSearch: true, showTopicFilters: true, showPostCount: false, showFeedHeading: true, showFeatured: true, searchPosition: "below", featuredPosition: "after", headingFont: "sans", headingScale: "display", spacing: "standard", cardStyle: "filled", imageRatio: "portrait", gridColumns: "three", showNumbers: false, font: "sans", background: "#17212b", text: "#edf2f7", accent: "#a9c7ff", width: "wide", border: "subtle", radius: 12, layout: "grid", heroLayout: "centered", showHero: true, showArtwork: false, showExcerpts: true, showImages: true, showDates: true, showTags: false } },
];

homepageTemplates.push(...componentHomepageTemplates(homepageTemplates[0]));

export const articleTemplates: PageTemplate[] = [
  { id: "feature", name: "Feature", description: "A full-width cover opens the story, followed by a bold headline and a focused reading column.", design: { tableOfContents: { style: "plain", radius: 0 }, headingFont: "playfair", headingScale: "display", spacing: "airy", bodySize: "regular", lineSpacing: "relaxed", measure: "reading", headingStyle: "plain", quoteStyle: "pull", font: "serif", background: "#ffffff", text: "#242424", accent: "#202020", width: "narrow", border: "subtle", radius: 4, headerLayout: "cover-first", showCover: true, showExcerpt: true, showDates: true, showTags: true } },
  { id: "essay", name: "Essay", description: "A spacious, centered title and a narrow reading column. A quiet opening for long-form writing.", design: { tableOfContents: { title: "In this essay", style: "plain", radius: 0 }, headingFont: "source-serif", headingScale: "standard", spacing: "airy", bodySize: "large", lineSpacing: "loose", measure: "focused", headingStyle: "plain", quoteStyle: "border", font: "source-serif", background: "#fbf8f1", text: "#352f28", accent: "#8b432c", width: "narrow", border: "subtle", radius: 0, headerLayout: "centered", showCover: false, showExcerpt: false, showDates: true, showTags: false } },
  { id: "technical", name: "Technical", description: "Title and introduction beside the cover, then a wide body for code, diagrams, and images.", design: { tableOfContents: { title: "On this page", style: "filled", width: 240, maxDepth: 3 }, headingFont: "plex-mono", headingScale: "compact", spacing: "compact", bodySize: "regular", lineSpacing: "compact", measure: "wide", headingStyle: "accent", quoteStyle: "panel", font: "sans", background: "#f7f9fc", text: "#243247", accent: "#2858ae", width: "wide", border: "subtle", radius: 8, headerLayout: "split", showCover: true, showExcerpt: true, showDates: true, showTags: true } },
  { id: "research", name: "Research", description: "A focused paper with an introduction and metadata, set in a traditional serif without a cover.", design: { tableOfContents: { title: "Contents", style: "outlined", numbered: true, radius: 0 }, headingFont: "source-serif", headingScale: "compact", spacing: "standard", bodySize: "small", lineSpacing: "relaxed", measure: "reading", headingStyle: "ruled", quoteStyle: "border", font: "source-serif", background: "#f4ecdf", text: "#45382e", accent: "#805127", width: "narrow", border: "subtle", radius: 0, headerLayout: "standard", showCover: false, showExcerpt: true, showDates: true, showTags: true } },
];

export function applySectionPreset<T extends DesignSurface>(theme: Theme, section: T, patch: Partial<NonNullable<Theme[T]>>): Theme {
  const presentation = section === "homepage"
    ? { sections: undefined, sectionSpacing: undefined, showSearch: true, showTopicFilters: true, showPostCount: true, showFeedHeading: true, showFeatured: true, searchPosition: "inline", featuredPosition: "before", cardStyle: "classic", imageRatio: "auto", gridColumns: "two", showNumbers: true }
    : { bodySize: "small", lineSpacing: "loose", measure: "auto", headingStyle: "plain", quoteStyle: "border" };
  const current = section === "homepage" ? theme.homepage : contentDesign(theme, section);
  const design = { ...current, ...presentation, headingFont: patch.font ?? current.font, headingScale: "standard", spacing: "standard", ...patch };
  if (section !== "homepage" && !(patch as Partial<ArticleDesign>).tableOfContents) delete (design as ArticleDesign).tableOfContents;
  return { ...theme, [section]: design };
}

export function matchesPreset(current: object, patch: object): boolean {
  return Object.entries(patch).every(([key, value]) => samePresetValue(current[key as keyof typeof current], value));
}

function samePresetValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => samePresetValue(value, (b as Record<string, unknown>)[key]));
}
