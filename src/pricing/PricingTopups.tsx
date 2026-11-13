import { ArrowUpRight, CreditCard } from "lucide-react";
import "../pricing.css";
import type { PricingPageController } from "./usePricingPage";
type Props = {
  state: Pick<PricingPageController, "data" | "error" | "busy" | "checkout">;
};
export default function PricingTopups({ state }: Props) {
  const { data, error, busy, checkout } = state;
  if (!data) return null;
  return (
    <section className="pricing-topups" aria-labelledby="topup-title">
      <div className="pricing-topup-intro">
        <span className="pricing-eyebrow">KEEP THE IDEAS COMING</span>
        <h2 id="topup-title">AI credits, when you need them.</h2>
        <p>
          Buy a one-time credit pack. Purchased credits do not expire and work
          without a hosting or AI subscription.
        </p>
        <div className="pricing-balance">
          <strong>{data.account.credits.toLocaleString("en-GB")}</strong>
          <span>
            credits available
            <br />
            {data.account.monthlyCredits.toLocaleString("en-GB")} monthly ·{" "}
            {data.account.topupCredits.toLocaleString("en-GB")} purchased
          </span>
        </div>
      </div>
      <div className="pricing-topup-packs">
        {data.topups.length ? (
          data.topups.map((pack) => (
            <div className="pricing-topup-pack" key={pack.id}>
              <CreditCard size={21} />
              <div>
                <h3>{pack.credits.toLocaleString("en-GB")} AI credits</h3>
                <p>
                  {money(pack.amount, pack.currency)}{" "}
                  <span>one-time payment</span>
                </p>
              </div>
              <button
                className="pricing-cta pricing-cta-dark"
                disabled={Boolean(busy) || Boolean(error) || !pack.available}
                onClick={() => void checkout(pack.id, "topup")}
              >
                {busy === pack.id
                  ? "Opening…"
                  : pack.available
                    ? "Buy credits"
                    : "Coming soon"}
                <ArrowUpRight size={15} />
              </button>
            </div>
          ))
        ) : (
          <p>Credit top-ups are not available yet.</p>
        )}
        <p className="pricing-costs">
          Writing assistant: {data.costs.writing} credits per request · Social
          summaries: {data.costs.summaries}{" "}
          {data.costs.summaries === 1 ? "credit" : "credits"} per set · Images:{" "}
          {data.costs.image} credits each
        </p>
      </div>
    </section>
  );
}

import { money } from "./format";
