import { isHostingPlan } from "../../shared/plans";
import { Check,Cloud,Zap } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Pricing } from "../../shared/pricing";
import { money } from "./format";
import PlanAction from "./PlanAction";
import type { PricingPageController } from "./usePricingPage";
type Props = {
  plan: Pricing["plans"][number];
  state: Pick<
    PricingPageController,
    "error" | "busy" | "checkoutNotice" | "checkout" | "current" | "existing"
  >;
};
export default function PricingPlan({ plan, state }: Props) {
  return (
    <article
      className={`pricing-plan ${plan.featured ? "pricing-plan-featured" : ""}`}
    >
      <div className="pricing-plan-label">
        <h2>{plan.name}</h2>
        {plan.featured && <span>For your next chapter</span>}
      </div>
      <p className="pricing-description">{plan.description}</p>
      <div className="pricing-price">
        {money(plan.amount, plan.currency)}
        <span>{plan.id === "free" ? "/ forever" : "/ month"}</span>
      </div>
      <div className="pricing-allowance">
        {isHostingPlan(plan.id) ? <Cloud size={16} /> : <Zap size={16} />}
        {isHostingPlan(plan.id) ? "Managed hosting · AI sold separately" : plan.credits ? (
          <>
            <strong>{plan.credits.toLocaleString("en-GB")}</strong> AI credits /
            month
          </>
        ) : (
          "The essentials, beautifully done."
        )}
      </div>
      <PlanAction plan={plan} state={state} />
      <CheckoutNotice id={plan.id} notice={state.checkoutNotice} />
      {isHostingPlan(plan.id) && state.existing && state.current !== plan.id && (
        <p className="pricing-plan-change-note">
          Moving to a smaller hosting plan later? Contact support and we’ll help after a quick storage check.
        </p>
      )}
      <div className="pricing-rule" />
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}>
            <Check size={15} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function CheckoutNotice({ id, notice }: { id: string; notice: PricingPageController["checkoutNotice"] }) {
  const active = notice?.id === id ? notice : null;
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [active]);
  return active ? <p ref={ref} className="pricing-checkout-notice" role="status">{active.message}</p> : null;
}
