import type { PricingPageController } from "./usePricingPage";
import PricingPlan from "./PricingPlan";
export default function HostingPlans({ state }: { state: PricingPageController }) {
  const plans = state.data?.hostingPlans;
  if (!plans?.length) return null;
  const current = state.data?.account.hostingPlanId || "free";
  return <section aria-label="Hosting plans" className="pricing-hosting">
    <h2>Hosting</h2>
    {state.data?.account.hostingRenewsAt && <p>Paid through {new Date(state.data.account.hostingRenewsAt).toLocaleDateString("en-GB")}</p>}
    <p>Pay for the infrastructure Margin provides. AI is optional. User-owned storage has no Margin quota.</p>
    <div className="pricing-plans pricing-hosting-plans">
      {plans.map(plan => <PricingPlan key={plan.id} plan={plan} state={{ ...state, current }} />)}
    </div>
  </section>;
}
