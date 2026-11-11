import "../pricing.css";
import PricingPlan from "./PricingPlan";
import type { PricingPageController } from "./usePricingPage";
type Props = {
  state: Pick<
    PricingPageController,
    "data" | "error" | "busy" | "checkoutNotice" | "checkout" | "current" | "existing"
  >;
};
export default function PricingPlans({ state }: Props) {
  const { data } = state;
  if (!data) return null;
  return (
    <div className="pricing-plans">
      {data.plans.map((plan) => (
        <PricingPlan key={plan.id} plan={plan} state={state} />
      ))}
    </div>
  );
}
