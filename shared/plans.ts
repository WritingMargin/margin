import catalog from "../backend/internal/blog/plan-catalog.generated.json";

export type PaidFeature = "ai" | "email" | "newsletter" | "integrations";
export interface SubscriptionPlan {
  id: string;
  name: string;
  credits: number;
  amount: number;
  currency: "gbp";
  interval: "month";
  integrationServices: boolean;
}
interface PlanDefinition extends Omit<SubscriptionPlan, "integrationServices"> {
  family: "ai" | "hosting";
  legacy: boolean;
  hostingSize: string;
  entitlements: Record<PaidFeature | "hosting", boolean>;
}

// Generated snapshot of Margin Central's catalog; never author plans here.
const definitions = catalog.plans as PlanDefinition[];
export const subscriptionPlans: SubscriptionPlan[] = definitions.map(plan => ({
  ...plan, integrationServices: plan.entitlements.integrations,
}));
export const planByID = (id: string | null | undefined) => definitions.find(plan => plan.id === id);
export const isPlanID = (id: string) => Boolean(planByID(id));
export const isHostingPlan = (id: string | null | undefined) => planByID(id)?.family === "hosting";
export const isLegacyPlan = (id: string | null | undefined) => planByID(id)?.legacy === true;
export function canUpgradePlan(current: string | undefined, next: string) {
  const target = planByID(next), previous = planByID(current);
  if (!target || target.legacy) return false;
  if (!current || current === "free") return true;
  return Boolean(previous && !previous.legacy && previous.family === target.family && target.amount > previous.amount);
}

export interface Entitlements {
  active: boolean;
  planId: string | null;
  expiresAt: string | null;
  ai: boolean;
  email: boolean;
  newsletter: boolean;
  integrations: boolean;
}
export function accountEntitlements(
  account: { enabled?: boolean; plan_id?: string | null; paid_until?: string | Date | null },
  now = Date.now(),
): Entitlements {
  const plan = planByID(account.plan_id);
  const end = account.paid_until ? new Date(account.paid_until).getTime() : NaN;
  const active = activeAIPlan(plan, account.enabled, end, now);
  return {
    active,
    planId: active ? plan!.id : null,
    expiresAt: active ? new Date(end).toISOString() : null,
    ai: active,
    email: active && plan!.entitlements.email,
    newsletter: active && plan!.entitlements.newsletter,
    integrations: active && plan!.entitlements.integrations,
  };
}

function activeAIPlan(plan: PlanDefinition | undefined, enabled: boolean | undefined, end: number, now: number) {
  return enabled !== false && plan?.entitlements.ai === true && Number.isFinite(end) && end > now;
}
