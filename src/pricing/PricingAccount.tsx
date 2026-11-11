import { ArrowUpRight,RefreshCw } from "lucide-react";
import "../pricing.css";
import type { PricingPageController } from "./usePricingPage";
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
          Your plan:{" "}
          <strong>{data.plans.find((p) => p.id === current)?.name}</strong>
          {data.account.renewsAt && (
            <>
              {" "}
              · {data.account.cancelsAtPeriodEnd
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
