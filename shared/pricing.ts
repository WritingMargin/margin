import { z } from "zod";

const offer = z.object({
  id: z.enum(["free", "starter", "studio"]),
  name: z.string(),
  description: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.literal("gbp"),
  credits: z.number().int().nonnegative(),
  features: z.array(z.string()),
  available: z.boolean(),
  featured: z.boolean(),
});
export const pricingSchema = z.object({
  plans: z
    .array(offer)
    .length(3)
    .refine((plans) => new Set(plans.map((p) => p.id)).size === 3),
  topups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      credits: z.number().int().positive(),
      amount: z.number().int().positive(),
      currency: z.literal("gbp"),
      available: z.boolean(),
    }),
  ),
  account: z.object({
    planId: z.enum(["free", "starter", "studio"]),
    credits: z.number().int().nonnegative(),
    monthlyCredits: z.number().int().nonnegative(),
    topupCredits: z.number().int().nonnegative(),
    canManage: z.boolean(),
    subscriptionStatus: z.string().nullable(),
    renewsAt: z.string().nullable(),
    cancelsAtPeriodEnd: z.boolean(),
  }),
  costs: z.object({
    writing: z.number().int().positive(),
    summaries: z.number().int().positive(),
    image: z.number().int().positive(),
  }),
  terms: z.array(z.string()),
});
export type Pricing = z.infer<typeof pricingSchema>;
