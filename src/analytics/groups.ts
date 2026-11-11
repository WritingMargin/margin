export const analyticsGroups = [
  "analytics",
  "traffic",
  "content",
  "reading",
  "media",
  "conversations",
] as const;
export type AnalyticsGroup = (typeof analyticsGroups)[number];
