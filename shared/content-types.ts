import contentDesignDefaults from "../backend/internal/blog/content-design-defaults.json";
import { publicationCopy, type PublicationType } from "./publication";
import type { ArticleDesign, ContentType, Theme } from "./types";

export type { ContentType } from "./types";
export const contentTypeIds = ["article", "guide"] as const;

// Each definition selects existing editor and reader capabilities. New structures
// must implement their renderer before they can be registered here.
export const contentTypes = [
  { id: "article", label: "Article", plural: "Articles", description: "Published stories and articles.", defaults: { tableOfContents: "off" } },
  { id: "guide", label: "Guide", plural: "Guides", description: "Step-by-step guides and playbooks.", defaults: { tableOfContents: "left" } },
] as const;

export function resolveContentType(value: unknown): ContentType {
  return contentTypeIds.includes(value as ContentType) ? value as ContentType : "article";
}

export function contentTypeLabel(value: ContentType | undefined, publicationType: PublicationType = "article"): string {
  const type = resolveContentType(value);
  if (type !== "article") return contentTypes.find(item => item.id === type)!.label;
  const label = publicationCopy(publicationType).singular;
  return label[0].toUpperCase() + label.slice(1);
}

export const defaultContentDesigns = contentDesignDefaults as Record<"guide", ArticleDesign>;

export function contentDesign(theme: Theme, value: ContentType | undefined): ArticleDesign {
  const type = resolveContentType(value);
  return type === "article" ? theme.article : theme[type] ?? defaultContentDesigns[type];
}

/** Existing article renderer reads the selected content surface without mutating the publication theme. */
export function themeForContentType(theme: Theme, value: ContentType | undefined): Theme {
  const type = resolveContentType(value);
  return type === "article" ? theme : { ...theme, article: contentDesign(theme, type) };
}
