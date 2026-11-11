import { mediaPath } from "../base-path";
import { type CSSProperties } from "react";
import { type Theme } from "../../shared/types";
import { typography } from "../../shared/typography";
import { sectionColors } from "../../shared/design-presets";
import "../blog-design.css";
import { safeMediaUrl } from "../Markdown";
export const date = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export function safeLogoUrl(value: string): string | undefined {
  if (
    /^\/api\/public\/logos\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      value,
    )
  )
    return mediaPath(value);
  return safeMediaUrl(value);
}
export function blogThemeStyle(
  theme: Theme,
  section: "homepage" | "article" = "article",
): CSSProperties {
  const look = theme[section];
  const colors = sectionColors(theme, section);
  return {
    "--article-font": typography[look.font].family,
    "--heading-font": typography[look.headingFont ?? look.font].family,
    "--body-size": `${({ small: 15, regular: 17, large: 20 })[theme.article.bodySize ?? "small"]}px`,
    "--body-leading": ({ compact: "1.6", relaxed: "1.8", loose: "1.95" })[theme.article.lineSpacing ?? "loose"],
    "--article-width": "var(--publication-width, 100%)",
    "--home-width": look.width === "wide" ? "1120px" : "760px",
    "--accent": colors.accent,
    "--blog-background": colors.background,
    "--blog-text": colors.text,
    "--image-border-width": mediaBorderWidth(theme.imageBorder),
    "--video-border-width": mediaBorderWidth(theme.videoBorder),
    "--radius": `${look.radius}px`,
    "--theme-border": look.border === "bold" ? "var(--blog-text)" : "color-mix(in srgb, var(--blog-text) 20%, var(--blog-background))",
  } as CSSProperties;
}

function mediaBorderWidth(value: Theme["imageBorder"]) {
  return { none: "0px", subtle: "1px", bold: "2px" }[value] || "1px";
}
