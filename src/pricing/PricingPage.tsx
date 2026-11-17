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
  const [autoTopupOpen, setAutoTopupOpen] = useState(false);
  const closeAutoTopup = () => { setAutoTopupOpen(false); state.purchase.dismiss(); };
  return (
    <section className="pricing-page">
      <ConfirmDialog confirmation={state.confirmation} icon={<Cloud size={21} />} />
      <PricingIntro />
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
          <PricingTopups state={state} onAutoTopup={() => setAutoTopupOpen(true)} />
          {(autoTopupOpen || state.purchase.confirmed) && <AutoTopup state={state} purchased={Boolean(state.purchase.confirmed)} onClose={closeAutoTopup} />}
          <PricingAccount state={state} />
          <SubscriptionControls state={state} />
          <HostingPlans state={state} />
          <SettingsDisclosure title="Content storage" description="Usage and allowance." icon={<Cloud />} className="pricing-storage">
            <StorageQuota />
          </SettingsDisclosure>
          <details className="billing-terms"><summary>Billing details</summary>
            {data.terms.map((term) => (
              <p key={term}>{term}</p>
            ))}
            <p>Secure payment through Stripe. Checkout opens in a new tab.</p>
          </details>
        </>
      )}
    </section>
  );
}

function PricingIntro() {
  return <header className="pricing-intro">
    <h1>Plans & billing</h1>
  </header>;
}

export default function PricingPage() {
  return <AccountGate feature="Plans and credits"><ConnectedPricingPage /></AccountGate>;
}
