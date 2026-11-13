import SubscriptionControls from "./SubscriptionControls";
import StorageQuota from "../admin/StorageQuota";
import HostingPlans from "./HostingPlans";
import AccountGate from "../auth/AccountGate";
import { useState } from "react";
import { Cloud, Loader2 } from "lucide-react";
import SettingsDisclosure from "../settings/SettingsDisclosure";
import ConfirmDialog from "../admin/ConfirmDialog";
import "../pricing.css";
import PricingAccount from "./PricingAccount";
import AutoTopup from "./AutoTopup";
import PricingTopups from "./PricingTopups";
import { usePricingPage } from "./usePricingPage";

function ConnectedPricingPage() {
  const state = usePricingPage();
  const { data, error, loading, refresh } = state;
  const [paymentReturned] = useState(() => new URLSearchParams(window.location.search).get("aiCredits") === "success");
  return (
    <section className="pricing-page">
      <ConfirmDialog confirmation={state.confirmation} icon={<Cloud size={21} />} />
      <PricingIntro />
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
              <Loader2 size={18} className="spin" /> Loading plans…
            </>
          ) : (
            "Pricing is unavailable right now. Please try again."
          )}
        </div>
      ) : (
        <>
          <PricingAccount state={state} />
          <SubscriptionControls state={state} />
          <HostingPlans state={state} />
          <SettingsDisclosure title="Content storage" description="Used storage and your remaining allowance." icon={<Cloud />} className="pricing-storage">
            <StorageQuota />
          </SettingsDisclosure>
          <PricingTopups state={state} />
          <AutoTopup state={state} />
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

function PricingIntro() {
  return <header className="pricing-intro">
    <span className="pricing-eyebrow">MARGIN AI</span>
    <h1>AI credits, wherever you host.</h1>
    <p>Buy AI credits as you need them, with optional auto top-up. No AI subscription. Hosting is billed separately.</p>
  </header>;
}

export default function PricingPage() {
  return <AccountGate feature="Plans and credits"><ConnectedPricingPage /></AccountGate>;
}
