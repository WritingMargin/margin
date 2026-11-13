import { z } from "zod";
import { isPlanID, isHostingPlan } from "./plans";

const planID = z.string().refine(id => id === "free" || isPlanID(id), "Unknown plan");

const offer = z.object({
  id: planID,
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
  autoTopup: z.object({enabled:z.boolean(),status:z.string(),packId:z.string(),threshold:z.number(),monthlyLimit:z.number(),spentThisMonth:z.number()}).optional(),
  audience: z.enum(["ai", "hosting"]).nullish(),
  plans: z
    .array(offer)
    .min(1)
    .refine((plans) => new Set(plans.map((p) => p.id)).size === plans.length),
  hostingPlans: z.array(offer).optional(),
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
    aiRenewalStopped: z.boolean().nullish(),
    hostingRenewalStopped: z.boolean().nullish(),
    hostingPlanId: z.string().refine(id => id === "" || isHostingPlan(id), "Unknown hosting plan").nullish(),
    hostingRenewsAt: z.string().nullish(),
    planId: planID,
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
