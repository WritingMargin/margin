import test from "node:test";
import assert from "node:assert/strict";
import { accountEntitlements, subscriptionPlans, planByID, canUpgradePlan } from "../shared/plans.ts";
import { pricingSchema } from "../shared/pricing.ts";

test("generated plan metadata controls permissions and upgrades", () => {
  for (const plan of subscriptionPlans) {
    const definition = planByID(plan.id)!;
    const access = accountEntitlements({ plan_id: plan.id, paid_until: "2099-01-01" });
    assert.equal(access.ai, definition.entitlements.ai);
    assert.equal(access.email, definition.entitlements.email);
    assert.equal(access.newsletter, definition.entitlements.newsletter);
    assert.equal(access.integrations, definition.entitlements.integrations);
    assert.equal(accountEntitlements({ plan_id: plan.id, paid_until: "2000-01-01" }).active, false);
  }
  assert.equal(canUpgradePlan("ai-starter", "ai-studio"), false);
  assert.equal(canUpgradePlan("hosting-starter", "hosting-studio"), true);
  assert.equal(canUpgradePlan("ai-studio", "ai-starter"), false);
  assert.equal(canUpgradePlan("starter", "ai-studio"), false);
  assert.equal(canUpgradePlan("ai-starter", "hosting-studio"), false);
  assert.equal(canUpgradePlan("free", "invented"), false);
  assert.equal(accountEntitlements({ plan_id: "invented", paid_until: "2099-01-01" }).active, false);
});

test("pricing validation accepts generated IDs and rejects unknown IDs", () => {
  const offer = pricingSchema.shape.plans.element;
  const sample = { name: "Plan", description: "Description", amount: 1000, currency: "gbp", credits: 0, features: [], available: true, featured: false };
  for (const plan of subscriptionPlans) assert.equal(offer.safeParse({ ...sample, id: plan.id }).success, true);
  assert.equal(offer.safeParse({ ...sample, id: "invented" }).success, false);
});
