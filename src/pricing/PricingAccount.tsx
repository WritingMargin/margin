import { ArrowUpRight,RefreshCw } from "lucide-react";
import "../pricing.css";
import type { PricingPageController } from "./usePricingPage";
import { subscriptionPlans, isLegacyPlan } from "../../shared/plans";
type Props = {
  state: Pick<
    PricingPageController,
    "data" | "error" | "loading" | "busy" | "refresh" | "checkout" | "current"
  >;
};
export default function PricingAccount({ state }: Props) {
  const { data, loading, busy, refresh, checkout, current } = state;
  if (!data) return null;
  return (
    <div className="pricing-account">
      <div>
        <p>
          AI billing:{" "}
          <strong>{data.plans.find((p) => p.id === current)?.name ?? subscriptionPlans.find((p) => p.id === current)?.name ?? "Prepaid credits"}</strong>
          {data.account.renewsAt && (
            <>
              {" "}
              · {renewalStopped(data.account)
                ? "Access until"
                : "Renews"}{" "}
              {new Date(data.account.renewsAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </>
          )}
        </p>
        <ExistingCredits audience={data.audience} current={current} />
      </div>
      <div className="pricing-account-actions">
        {data.account.canManage && (
          <button
            className="button"
            disabled={Boolean(busy)}
            onClick={() => void checkout("manage", "manage")}
          >
            Manage subscription <ArrowUpRight size={14} />
          </button>
        )}
        <button
          className="button"
          disabled={loading}
          aria-label="Refresh pricing and balance"
          onClick={() => void refresh()}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
        </button>
      </div>
    </div>
  );
}

function ExistingCredits({ audience, current }: { audience: string | null | undefined; current: string | undefined }) {
  if (audience !== "ai" || !isLegacyPlan(current)) return null;
  return <p>Your existing subscription already includes AI credits for this engine.</p>;
}

function renewalStopped(account: { aiRenewalStopped?: boolean | null; cancelsAtPeriodEnd: boolean }) { return account.aiRenewalStopped || account.cancelsAtPeriodEnd; }
