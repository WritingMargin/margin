import { z } from "zod";
import { designSchema, typographyFields, homePresentationFields, articlePresentationFields } from "./design-config";
import { homepageTemplates, articleTemplates } from "./design-presets";
import { postTemplates, type PostTemplate } from "./post-templates";
import { contentTypeIds, defaultContentDesigns } from "./content-types";
import type { ContentType, ArticleDesign } from "./types";
import type { PageTemplate } from "./design-presets";

const metadata = {
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(300),
};
const lookFields = { background: true, text: true, accent: true, font: true, width: true, border: true, radius: true } as const;
const homeDesign = designSchema.shape.homepage.pick({ ...lookFields, layout: true, heroLayout: true, showHero: true, showArtwork: true, showExcerpts: true, showImages: true, showDates: true, showTags: true }).required().extend({ ...typographyFields, ...homePresentationFields, ...designSchema.shape.homepage.pick({ sections: true, sectionSpacing: true, showSearch: true, showTopicFilters: true, showPostCount: true, showFeedHeading: true, showFeatured: true, searchPosition: true, featuredPosition: true }).shape });
const articleDesign = designSchema.shape.article.pick({ ...lookFields, headerLayout: true, showCover: true, showExcerpt: true, showDates: true, showTags: true }).required().extend({ ...typographyFields, ...articlePresentationFields });
function uniqueTemplates<T extends z.ZodType<{ id: string }>>(schema: T) {
  return z.array(schema).min(1).max(50).refine(items => new Set(items.map(item => item.id)).size === items.length, "Template IDs must be unique within a collection.");
}

const writingTemplateSchema = z.strictObject({ ...metadata, content: z.string().trim().min(1).max(20000), supportedContentTypes: z.array(z.enum(contentTypeIds)).min(1).max(2).refine(items => new Set(items).size === items.length, "Content types must be unique.").optional() });
export const contentTemplateSchema = z.strictObject({
  ...metadata,
  designs: z.strictObject({ article: articleDesign.optional(), guide: articleDesign.optional() })
    .refine(designs => Object.values(designs).some(Boolean), "Provide a design for at least one supported content type."),
});
export type ContentTemplate = z.infer<typeof contentTemplateSchema>;

const legacyCatalogSchema = z.strictObject({
  schemaVersion: z.literal(4),
  version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/),
  homepage: uniqueTemplates(z.strictObject({ ...metadata, design: homeDesign })),
  article: uniqueTemplates(z.strictObject({ ...metadata, design: articleDesign })),
  writing: uniqueTemplates(z.strictObject({ ...metadata, content: z.string().trim().min(1).max(20000) })),
});
export const templateCatalogSchema = legacyCatalogSchema.extend({
  schemaVersion: z.literal(5),
  content: uniqueTemplates(contentTemplateSchema),
  writing: uniqueTemplates(writingTemplateSchema),
});
export type TemplateCatalog = z.infer<typeof templateCatalogSchema>;

const colors = { background: "#ffffff", text: "#242424", accent: "#2457c5" };
const guideDesign = { ...defaultContentDesigns.guide, ...colors };
export const contentTemplates = [
  ...articleTemplates.map(({ design, ...metadata }) => ({ ...metadata, designs: { article: design } })),
  { id: "handbook", name: "Handbook", description: "Clear steps, generous reading space, and distinct section headings for guides.", designs: { guide: guideDesign } },
  { id: "publication-suite", name: "Publication suite", description: "A shared visual identity with dedicated layouts for articles and guides.", designs: { article: articleTemplates[0].design, guide: { ...guideDesign, accent: "#202020", headingFont: "playfair" } } },
];

// The same contract validates bundled defaults and Central's response.
export const bundledTemplateCatalog = templateCatalogSchema.parse({ schemaVersion: 5, version: "2026-10-23.5", homepage: homepageTemplates, article: articleTemplates, content: contentTemplates, writing: postTemplates });

/** Compatibility comes from implemented, validated per-type configs, never a label alone. */
export function contentTemplatesFor(catalog: TemplateCatalog, type: ContentType): PageTemplate[] {
  return catalog.content.flatMap(template => {
    const design = template.designs[type];
    return design ? [{ id: template.id, name: template.name, description: template.description, design }] : [];
  });
}
export function supportedContentTypes(template: ContentTemplate): ContentType[] {
  return contentTypeIds.filter(type => template.designs[type] !== undefined);
}
export function writingTemplatesFor(catalog: Pick<TemplateCatalog, "writing">, type: ContentType): PostTemplate[] {
  return catalog.writing.filter(template => (template.supportedContentTypes ?? ["article"]).includes(type));
}
/** Applies only the chosen target. A combination template never changes other surfaces implicitly. */
export function contentTemplateDesign(template: ContentTemplate, type: ContentType): ArticleDesign | null {
  return template.designs[type] ?? null;
}

export function parseTemplateCatalog(value: unknown): TemplateCatalog | null {
  const parsed = templateCatalogSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const legacy = legacyCatalogSchema.safeParse(value);
  if (!legacy.success) return null;
  const migrated = templateCatalogSchema.safeParse({
    ...legacy.data,
    schemaVersion: 5,
    // Old catalogs only advertise article support. Bundled guide options stay available.
    content: [
      ...legacy.data.article.map(({ design, ...metadata }) => ({ ...metadata, designs: { article: design } })),
      ...bundledTemplateCatalog.content.filter(template => !template.designs.article && !legacy.data.article.some(item => item.id === template.id)),
    ].slice(0, 50),
    writing: [...legacy.data.writing, ...bundledTemplateCatalog.writing.filter(template => template.supportedContentTypes && !template.supportedContentTypes.includes("article") && !legacy.data.writing.some(item => item.id === template.id))].slice(0, 50),
  });
  return migrated.success ? migrated.data : null;
}
