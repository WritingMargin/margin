import { blockPosterSchema } from "./block-poster";
import { z } from "zod";
import {
  illustrationFlowSchema,
  validateFlow,
} from "./illustration-flow-schema";

const text = z.string().trim().min(1).max(160);
const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a six-digit hex color.");
const coordinate = z.number().finite().min(0).max(1000);
// Only SVG geometry is accepted: no markup, URLs, styles or event handlers.
const path = z
  .string()
  .trim()
  .min(1)
  .max(8000)
  .regex(
    /^[Mm][MmLlHhVvCcSsQqTtAaZz0-9eE.,+\s-]+$/,
    "Use SVG path geometry, not SVG markup.",
  );
export const illustrationSchema = z
  .object({
    title: text,
    poster: blockPosterSchema.optional(),
    artwork: blockPosterSchema.optional(),
    description: z.string().max(2000).optional(),
    width: z.number().int().min(100).max(1000).default(600),
    height: z.number().int().min(100).max(1000).default(600),
    background: color.default("#faf5ed"),
    flow: illustrationFlowSchema.optional(),
    shapes: z
      .array(
        z
          .object({
            path,
            fill: color,
            stroke: color.optional(),
            strokeWidth: z.number().min(0).max(20).default(2),
            region: text.optional(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
    regions: z
      .array(
        z
          .object({
            id: text,
            label: text,
            description: z.string().trim().min(1).max(2000),
            x: coordinate,
            y: coordinate,
            color: color.default("#a64040"),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (!spec.artwork && !spec.shapes.length)
      ctx.addIssue({
        code: "custom",
        path: ["shapes"],
        message: "Supply artwork or at least one shape.",
      });
    const ids = new Set(spec.regions.map((region) => region.id));
    validateFlow(spec.flow, spec.width, spec.height, ids, ctx);
    if (ids.size !== spec.regions.length)
      ctx.addIssue({
        code: "custom",
        path: ["regions"],
        message: "Region IDs must be unique.",
      });
    spec.shapes.forEach((shape, index) => {
      if (shape.region && !ids.has(shape.region))
        ctx.addIssue({
          code: "custom",
          path: ["shapes", index, "region"],
          message: "Reference an existing region ID.",
        });
    });
    spec.regions.forEach((region, index) => {
      if (region.x > spec.width || region.y > spec.height)
        ctx.addIssue({
          code: "custom",
          path: ["regions", index],
          message: "Keep markers inside the illustration dimensions.",
        });
    });
  });
export type IllustrationSpec = z.infer<typeof illustrationSchema>;
