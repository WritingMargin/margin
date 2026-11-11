import { ArrowUpRight,Check,Loader2 } from "lucide-react";
import type { Pricing } from "../../shared/pricing";
import type { PricingPageController } from "./usePricingPage";
type Props = {
  plan: Pricing["plans"][number];
  state: Pick<
    PricingPageController,
    "error" | "busy" | "checkout" | "current" | "existing"
  >;
};
export default function PlanAction({ plan, state }: Props) {
  const { busy, checkout, current, existing } = state;
  return (
    <button
      type="button"
      className={`pricing-cta ${plan.featured ? "pricing-cta-dark" : ""}`}
      disabled={
        Boolean(busy) ||
        current === plan.id ||
        plan.id === "free" ||
        !plan.available
      }
      onClick={() => void checkout(plan.id, existing ? current === "studio" ? "manage" : "change" : "plan")}
    >
      <ActionLabel plan={plan} state={state} />
    </button>
  );
}
function ActionLabel({ plan, state }: Props) {
  const { busy, current, existing } = state;
  if (busy === plan.id)
    return (
      <>
        <Loader2 size={16} className="spin" /> {existing ? "Opening plan change…" : "Opening checkout…"}
      </>
    );
  if (current === plan.id)
    return (
      <>
        <Check size={16} /> Your current plan
      </>
    );
  if (plan.id === "free") return "Included with every plan";
  if (!plan.available) return "Coming soon";
  if (existing && current === "studio") return "Manage your subscription";
  if (existing) return <>Upgrade to {plan.name}<ArrowUpRight size={16} /></>;
  return (
    <>
      Subscribe to {plan.name}
      <ArrowUpRight size={16} />
    </>
  );
}
