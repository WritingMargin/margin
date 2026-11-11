import { contentTypes } from "../../shared/content-types";
import { type CSSProperties } from "react";
import { type Post,type Theme } from "../../shared/types";
import { typography } from "../../shared/typography";
import { seedContent } from "../Markdown";
export const draft = (): Post => ({
  id: "",
  title: "Technical ideas you can explore",
  slug: "technical-ideas-you-can-explore",
  excerpt:
    "An interactive guide to data, system diagrams, and 3D explanations.",
  content: seedContent,
  status: "draft",
  featured: false,
  tableOfContents: "off",
  tags: ["Engineering", "Interactive"],
  cover: "",
  recommendations: { mode: "automatic", postIds: [] },
  seo: { title: "", description: "", image: "" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
export const emptyDraft = (contentType: import("../../shared/content-types").ContentType = "article"): Post => ({
  ...draft(),
  contentType,
  tableOfContents: contentTypes.find(type => type.id === contentType)!.defaults.tableOfContents,
  title: "Untitled",
  slug: `untitled-${Date.now()}`,
  content: "",
  tags: [],
  excerpt: "",
});
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const date = (s: string) =>
  new Date(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const themeStyle = (t: Theme): CSSProperties =>
  ({
    "--article-font": (typography[t.article.font] || typography.serif).family,
    "--article-width": t.article.width === "wide" ? "1200px" : "1000px",
    "--accent": t.accent,
    "--radius": `${t.article.radius}px`,
    "--theme-border": t.article.border === "bold" ? "#242424" : "#e5e5e2",
  }) as CSSProperties;
