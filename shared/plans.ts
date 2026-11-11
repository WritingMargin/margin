export interface SubscriptionPlan {
  id: "starter" | "studio";
  name: string;
  credits: number;
  amount: number;
  currency: "gbp";
  interval: "month";
  integrationServices: boolean;
}
export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Starter",
    credits: 200,
    amount: 1000,
    currency: "gbp",
    interval: "month",
    integrationServices: false,
  },
  {
    id: "studio",
    name: "Studio",
    credits: 1000,
    amount: 5000,
    currency: "gbp",
    interval: "month",
    integrationServices: true,
  },
];

export type PaidFeature = "ai" | "email" | "newsletter" | "integrations";
export interface Entitlements {
  active: boolean;
  planId: SubscriptionPlan["id"] | null;
  expiresAt: string | null;
  ai: boolean;
  email: boolean;
  newsletter: boolean;
  integrations: boolean;
}
export function accountEntitlements(
  account: {
    enabled?: boolean;
    plan_id?: string | null;
    paid_until?: string | Date | null;
  },
  now = Date.now(),
): Entitlements {
  const plan = subscriptionPlans.find((p) => p.id === account.plan_id);
  const end = account.paid_until ? new Date(account.paid_until).getTime() : NaN;
  const active =
    account.enabled !== false &&
    Boolean(plan) &&
    Number.isFinite(end) &&
    end > now;
  return {
    active,
    planId: active ? plan!.id : null,
    expiresAt: active ? new Date(end).toISOString() : null,
    ai: active,
    email: active,
    newsletter: active,
    integrations: active && plan!.id === "studio",
  };
}
