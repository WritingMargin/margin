import { z } from "zod";

const rowStyle = {
  border: z.enum(["none", "top", "bottom", "top-and-bottom"]).optional(),
  paddingBlock: z.number().int().min(0).max(80).optional(),
  gap: z.number().int().min(0).max(64).optional(),
};
export const feedHeaderSchema = z.strictObject({
  ...rowStyle,
  title: z.string().max(150).optional(),
  showArrow: z.boolean().optional(),
});
export const feedFiltersSchema = z.strictObject({
  ...rowStyle,
  layout: z.enum(["inline", "stacked"]).optional(),
  mobileLayout: z.enum(["wrap", "stacked"]).optional(),
  topics: z.strictObject({
    allLabel: z.string().max(100).optional(),
    labels: z.record(z.string().min(1).max(100), z.string().min(1).max(100)).optional(),
  }).optional(),
  search: z.strictObject({
    placeholder: z.string().max(150).optional(),
    position: z.enum(["start", "end"]).optional(),
    maxWidth: z.number().int().min(160).max(800).optional(),
  }).optional(),
});
export type FeedHeaderDesign = z.infer<typeof feedHeaderSchema>;
export type FeedFiltersDesign = z.infer<typeof feedFiltersSchema>;

// Keep DOM reading/tab order consistent with the configured search placement.
export function feedSearchFirst(position: string | undefined, filters: FeedFiltersDesign | undefined): boolean {
  if (position === "above") return true;
  if (position === "below") return false;
  return filters?.search?.position === "start";
}
export function feedTopicLabel(tag: string, labels?: Record<string, string>): string {
  return labels && Object.hasOwn(labels, tag) ? labels[tag] : tag;
}
