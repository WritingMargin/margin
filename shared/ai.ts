import type { SubscriptionPlan, Entitlements } from "./plans.ts";
export const platformLabels = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  devto: "DEV.to",
  substack: "Substack",
  medium: "Medium",
} as const;
export type SocialPlatform = keyof typeof platformLabels;
export type SummaryTone = "natural" | "professional" | "playful";
export type ImageStyle =
  "editorial" | "photographic" | "illustration" | "minimal";
export type ImageSize = "1536x1024" | "1024x1024" | "1024x1536";
export interface SocialSummary {
  platform: SocialPlatform;
  text: string;
}
export interface SummaryGeneration {
  id: string;
  postId: string;
  sourceHash: string;
  createdAt: string;
  tone: SummaryTone;
  summaries: SocialSummary[];
}
export interface GeneratedImage {
  id: string;
  title?: string;
  postId: string;
  url: string;
  prompt: string;
  style: ImageStyle;
  size: ImageSize;
  sourceHash: string;
  createdAt: string;
}
export interface AIConfig {
  configured: boolean;
  textModel: string;
  imageModel: string;
  styles: ImageStyle[];
  features: {
    simplified?: boolean;
    writing: boolean;
    summaries: boolean;
    image: boolean;
    imageBrief: boolean;
  };
  monthlyCredits?: number;
  topupCredits?: number;
  topups?: {
    id: string;
    name: string;
    credits: number;
    amount: number;
    currency: string;
  }[];
  credits?: number;
  costs?: { writing: number; summaries: number; image: number; simplified?: number };
  plans?: SubscriptionPlan[];
  subscription?: {
    planId: string;
    status: string;
    cancel_at_period_end: boolean;
    paidUntil: string;
  } | null;
  entitlements?: Entitlements;
}
export interface AIHistory {
  summaries: SummaryGeneration[];
  images: GeneratedImage[];
}

// Blogging platform values are summary budgets, not publishing limits.
export const bloggingPlatforms: SocialPlatform[] = ["devto", "substack", "medium"];

export const platformCharacterLimits: Record<SocialPlatform, number> = {
  linkedin: 3000,
  x: 280,
  instagram: 2200,
  facebook: 5000,
  threads: 500,
  devto: 1500,
  substack: 1500,
  medium: 1500,
};
export const aiInputLimits = {
  content: 40000,
  instructions: 2000,
  prompt: 4000,
} as const;
