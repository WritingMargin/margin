import AccountGate from "../auth/AccountGate";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import "../pricing.css";
import PricingAccount from "./PricingAccount";
import PricingPlans from "./PricingPlans";
import PricingTopups from "./PricingTopups";
import { usePricingPage } from "./usePricingPage";

function ConnectedPricingPage() {
  const state = usePricingPage();
  const { data, error, loading, refresh } = state;
  const [paymentReturned] = useState(() => new URLSearchParams(window.location.search).get("aiCredits") === "success");
  return (
    <section className="pricing-page">
      <header className="pricing-intro">
        <span className="pricing-eyebrow">A LITTLE SPACE. ROOM TO GROW.</span>
        <h1>
          Your words.
          <br />
          Your next chapter.
        </h1>
        <p>
          Start with a home for your ideas. Add the tools to take them further.
        </p>
      </header>
      {paymentReturned && (
        <p role="status">
          Payment confirmation can take a few moments. Your plan and credits
          refresh automatically.
        </p>
      )}
      {error && (
        <div className="pricing-error" role="alert">
          <span>{error}</span>
          <button className="button" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}
      {!data ? (
        <div className="pricing-loading" role="status">
          {loading ? (
            <>
              <Loader2 size={18} className="spin" /> Getting plans from Margin
              Central…
            </>
          ) : (
            "Pricing is unavailable until Margin Central reconnects."
          )}
        </div>
      ) : (
        <>
          <PricingAccount state={state} />
          <PricingPlans state={state} />
          <PricingTopups state={state} />
          <footer className="pricing-footer">
            <span>Good to know</span>
            {data.terms.map((term) => (
              <p key={term}>{term}</p>
            ))}
            <p>Secure payment through Stripe. Checkout opens in a new tab.</p>
          </footer>
        </>
      )}
    </section>
  );
}

export default function PricingPage() {
  return <AccountGate feature="Plans and credits"><ConnectedPricingPage /></AccountGate>;
}
