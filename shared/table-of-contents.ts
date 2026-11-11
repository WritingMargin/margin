import { z } from "zod";

const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
/** Optional presentation only: visibility and placement belong to each post. */
export const tableOfContentsDesignSchema = z.strictObject({
  title: z.string().max(80).optional().describe("Panel heading. Empty hides it; omitted: On this page."),
  style: z.enum(["plain", "outlined", "filled"]).optional().describe("Panel treatment. Omitted: outlined."),
  numbered: z.boolean().optional().describe("Number links in reading order. Omitted: false."),
  maxDepth: z.number().int().min(1).max(6).optional().describe("Deepest heading level included: 2 includes H1 and H2. Omitted: 6."),
  sticky: z.boolean().optional().describe("Keep sidebars visible while scrolling on desktop. Omitted: true."),
  width: z.number().int().min(160).max(320).optional().describe("Desktop sidebar width in pixels. Omitted: 210."),
  radius: z.number().int().min(0).max(32).optional().describe("Panel corner radius in pixels. Omitted: 8."),
  background: color.optional().describe("Panel background. Omit for the style default."),
  text: color.optional().describe("Panel text. Omit to inherit article text."),
  accent: color.optional().describe("Current section marker and focus colour. Omit to inherit the article accent."),
});
export type TableOfContentsDesign = z.infer<typeof tableOfContentsDesignSchema>;
export function contentsDesignStyle(design: TableOfContentsDesign): string {
  return Object.entries(design).flatMap(([key, value]) => {
    if (["width", "radius"].includes(key)) return [`--toc-${key}:${value}px`];
    if (["background", "text", "accent"].includes(key)) return [`--toc-${key}:${value}`];
    return [];
  }).join(";");
}
