import { ArrowUpRight, Plus } from "lucide-react";
import { useState } from "react";
import "../pricing.css";
import type { PricingPageController } from "./usePricingPage";
import { money } from "./format";
import CreditDialog from "./CreditDialog";
import { customCreditQuote } from "../../shared/credit-purchase";

type Props = { state: PricingPageController; onAutoTopup: () => void };
export default function PricingTopups({ state, onAutoTopup }: Props) {
  const [custom, setCustom] = useState(false);
  const { data, busy, checkout, checkoutNotice } = state;
  if (!data) return null;
  const notice = state.purchase.pending ? "Awaiting payment confirmation…" : checkoutNotice?.message;
  return <section className="credit-purchase" aria-labelledby="credits-title">
    <div className="credit-purchase-heading">
      <div><span className="credit-balance-label">Available credits</span><div className="credit-balance"><strong>{data.account.credits.toLocaleString("en-GB")}</strong><span>credits</span></div></div>
      <button className="credit-settings" onClick={onAutoTopup}>Auto top-up <span>{autoTopupLabel(data.autoTopup?.status)}</span><ArrowUpRight size={14} /></button>
    </div>
    <div className="credit-purchase-label"><h2 id="credits-title">Add credits</h2></div>
    <div className="credit-amounts">
      {data.topups.map(pack => <button key={pack.id} className="credit-amount" disabled={Boolean(busy) || !pack.available} onClick={() => void checkout(pack.id, "topup")}>
        <span className="credit-amount-price">{busy === pack.id ? "Opening…" : money(pack.amount, pack.currency)}<ArrowUpRight size={18} /></span>
        <span>{pack.credits.toLocaleString("en-GB")} credits</span>
        {!pack.available && <small>Unavailable</small>}
      </button>)}
      <button className="credit-amount credit-amount-other" disabled={Boolean(busy) || !data.customCredits?.available} onClick={() => setCustom(true)}><span className="credit-amount-price">Other <Plus size={18} /></span><span>Custom amount</span></button>
    </div>
    {notice && <p className="credit-notice" role="status">{notice}</p>}
    <p className="credit-purchase-note">Credits never expire.</p>
    <p className="credit-usage">Credit usage: Writing {data.costs.writing} · Social summaries {data.costs.summaries} · Images {data.costs.image}</p>
    {custom && <CustomCredits state={state} onClose={() => setCustom(false)} />}
  </section>;
}
function autoTopupLabel(status: string | undefined) {
  if (status === "ready") return "On";
  if (status === "awaiting_setup") return "Finish setup";
  if (status === "needs_attention") return "Needs attention";
  return "Off";
}
function CustomCredits({ state, onClose }: { state: PricingPageController; onClose: () => void }) {
  const [value, setValue] = useState("");
  const amount = Math.round(Number(value) * 100);
  const offer = state.data!.customCredits!;
  const credits = customCreditQuote(amount, offer);
  return <CreditDialog title="Add credits" onClose={onClose}>

    <form className="credit-form" onSubmit={async e => { e.preventDefault(); if (credits !== null && await state.checkout("custom", "topup", amount)) onClose(); }}>
      <label>Amount (£)<input autoFocus type="number" inputMode="decimal" min={offer.minAmount / 100} max={offer.maxAmount / 100} step="0.05" required placeholder="25" value={value} onChange={e => setValue(e.target.value)} /></label>
      <p className="credit-quote" aria-live="polite">{credits === null ? `${money(offer.minAmount, "gbp")}–${money(offer.maxAmount, "gbp")} · 20 credits / £1` : <><strong>{credits.toLocaleString("en-GB")}</strong> credits · 20 / £1</>}</p>
      {state.checkoutNotice && <p role="status">{state.checkoutNotice.message}</p>}
      <button className="pricing-cta pricing-cta-dark" disabled={credits === null || Boolean(state.busy)}>{state.busy ? "Opening…" : "Buy credits"}<ArrowUpRight size={16} /></button>
    </form>
  </CreditDialog>;
}
