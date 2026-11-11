import { previewMediaBase } from "./preview-media";
import { resolveVideo } from "./video";
import { coverImage } from "./audio";
import { z } from "zod";
import type { HomepageDesign, Post, Theme } from "./types";

export const textVariables = ["blog.title", "blog.description", "homepage.title", "homepage.description", "content.title", "content.description"] as const;
export const imageVariables = ["blog.logo", "homepage.image", "content.cover"] as const;
export const linkVariables = ["blog.url", "content.url"] as const;
export type TemplateVariable = typeof textVariables[number] | typeof imageVariables[number] | typeof linkVariables[number];
export type TemplateValue = string | { bind: TemplateVariable; fallback?: string };

export function safeTemplateURL(value: string, image = false): boolean {
  if (!value) return true;
  if (/[\s\\\u0000-\u001f]/.test(value)) return false;
  if (localTemplateURL(value, image)) return true;
  return httpTemplateURL(value);
}
function localTemplateURL(value: string, image: boolean) {
  if (image) return /^\/api\/(public\/(covers|logos)\/|assets\/)[a-zA-Z0-9.-]+$/.test(previewMediaBase(value));
  return /^\/(?!\/)/.test(value) || /^#[a-zA-Z][\w-]*$/.test(value);
}
function httpTemplateURL(value: string) {
  if (!/^https?:\/\//i.test(value)) return false;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}

function field<const V extends readonly [string, ...string[]]>(variables: V, literal: z.ZodString) {
  return z.union([literal, z.strictObject({ bind: z.enum(variables), fallback: literal.optional() })]);
}
const textField = (max: number) => field(textVariables, z.string().max(max));
const imageField = field(imageVariables, z.string().max(2048).refine(value => safeTemplateURL(value, true), "Use an image URL or an uploaded image path."));
const linkField = field(linkVariables, z.string().max(2048).refine(value => safeTemplateURL(value), "Use an HTTP(S) URL, site path, or section anchor."));
export const heroVideoSchema = z.string().max(2048).refine(value => value === "" || !!resolveVideo(value), "Use a supported video URL or an uploaded video path.");
const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const heroSectionSchema = z.strictObject({
  id, component: z.literal("hero"), variant: z.enum(["split", "centered", "image-background"]),
  props: z.strictObject({
    source: z.enum(["latest", "featured"]), title: textField(200), description: textField(1000),
    image: imageField, mediaType: z.enum(["image", "video"]).optional(), video: heroVideoSchema.optional(), buttonLabel: textField(80), buttonHref: linkField,
  }),
});
const sectionSchema = z.discriminatedUnion("component", [heroSectionSchema,
  z.strictObject({ id, component: z.literal("featured-posts") }),
  z.strictObject({ id, component: z.literal("post-feed") }),
]);
export const homepageSectionsSchema = z.array(sectionSchema).min(1).max(3).superRefine((sections, context) => {
  if (new Set(sections.map(section => section.id)).size !== sections.length || new Set(sections.map(section => section.component)).size !== sections.length)
    context.addIssue({ code: "custom", message: "Use unique section IDs and one of each component." });
  if (!sections.some(section => section.component === "post-feed")) context.addIssue({ code: "custom", message: "Keep one post feed so readers can browse your writing." });
});
export type HeroSection = z.infer<typeof heroSectionSchema>;
export type HomepageSection = z.infer<typeof sectionSchema>;

export function defaultHeroSection(): HeroSection {
  return { id: "welcome", component: "hero", variant: "split", props: {
    source: "latest", title: { bind: "blog.title" }, description: { bind: "blog.description" },
    image: { bind: "content.cover" }, buttonLabel: "Explore stories", buttonHref: "#posts",
  } };
}

export function selectTemplatePost(posts: Post[], source: "latest" | "featured"): Post | undefined {
  const published = posts.filter(post => post.status === "published").sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return (source === "featured" ? published.find(post => post.featured) : undefined) ?? published[0];
}

export function resolveTemplateValue(value: TemplateValue, theme: Theme, post?: Post): string {
  if (typeof value === "string") return value;
  const content = post?.status === "published" ? post : undefined;
  const variables: Record<TemplateVariable, string | undefined> = {
    "blog.title": theme.name, "blog.description": theme.description, "blog.logo": theme.logo, "blog.url": "/",
    "homepage.title": theme.homepage.title, "homepage.description": theme.homepage.description, "homepage.image": theme.homepage.artworkImage,
    "content.title": content?.title, "content.description": content?.excerpt, "content.cover": coverImage(content?.cover),
    "content.url": content ? `/post/${encodeURIComponent(content.slug)}` : undefined,
  };
  return variables[value.bind] || value.fallback || "";
}

export function resolveHero(section: HeroSection, theme: Theme, posts: Post[]) {
  const post = selectTemplatePost(posts, section.props.source);
  const value = (key: keyof Omit<HeroSection["props"], "source">) => resolveTemplateValue(section.props[key] as TemplateValue, theme, post);
  const image = value("image"), href = value("buttonHref");
  const source = section.props.video ?? theme.homepage.artworkVideo ?? "";
  const video = section.props.mediaType === "video" && resolveVideo(source) ? source : "";
  const variant = video && section.variant === "image-background" ? "split" : section.variant;
  return { video, variant, title: value("title"), description: value("description"), buttonLabel: value("buttonLabel"),
    image: !video && safeTemplateURL(image, true) ? image : "", href: safeTemplateURL(href) ? href : "" };
}

export function homepageHasFeatured(design: HomepageDesign): boolean {
  return design.showFeatured !== false && (!design.sections || design.sections.some(section => section.component === "featured-posts"));
}
