import { useState } from "react";
import { api, json } from "../api";
import type { Pricing } from "../../shared/pricing";
import type { PricingPageController } from "./usePricingPage";
import { money } from "./format";
import CreditDialog from "./CreditDialog";
import { customCreditQuote } from "../../shared/credit-purchase";

const defaults = { enabled: false, status: "disabled", packId: "", threshold: 20, monthlyLimit: 2000, spentThisMonth: 0 };
const amountLimits = { minAmount: 500, maxAmount: 100000 };
function initialTopupAmount(data: Pricing, purchased?: { amount: number } | null) {
  return data.autoTopup?.amount || data.topups.find(p => p.id === data.autoTopup?.packId)?.amount || purchased?.amount || 500;
}
function useAutoTopup(data: Pricing, refresh: () => Promise<void>, purchased?: { amount: number; credits: number } | null) {
  const settings = data.autoTopup || defaults;
  const initialAmount = initialTopupAmount(data, purchased);
  const [amount, setAmount] = useState(String(initialAmount / 100));
  const [threshold, setThreshold] = useState(settings.threshold || 20);
  const [limit, setLimit] = useState(Math.max(settings.monthlyLimit || 2000, initialAmount) / 100);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pence = Math.round(Number(amount) * 100);
  const credits = customCreditQuote(pence, amountLimits);
  async function save(enabled: boolean) {
    setBusy(true); setError("");
    try {
      if (enabled && credits === null) throw new Error("Choose £5–£1,000 in 5p increments.");
      await applySettings(enabled, { amount: pence, threshold, monthlyLimit: Math.round(limit * 100), consent });
      setConsent(false); await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return { settings, amount, pence, credits, threshold, limit, consent, busy, error, save, setAmount, setThreshold, setLimit, setConsent };
}
async function applySettings(enabled: boolean, input: Record<string, unknown>) {
  const tab = enabled ? window.open("about:blank", "_blank") : null;
  if (tab) tab.opener = null;
  try {
    if (enabled && !tab) throw new Error("Allow a new tab for secure card setup.");
    const payload = enabled ? { enabled, ...input } : { enabled };
    const result = await api<{ url?: string }>("/ai/billing/auto-topup", json("POST", payload));
    if (tab) tab.location.href = setupURL(result.url);
  } catch (error) { tab?.close(); throw error; }
}
function setupURL(address: string | undefined) {
  const url = new URL(address || "");
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com") throw new Error("Card setup returned an unexpected address.");
  return url.href;
}
type Controls = ReturnType<typeof useAutoTopup>;
export default function AutoTopup({ state, purchased, onClose }: { state: PricingPageController; purchased: boolean; onClose: () => void }) {
  const data = state.data!;
  const controls = useAutoTopup(data, state.refresh, state.purchase.confirmed);
  return <CreditDialog title="Auto top-up" onClose={onClose}>
    {purchased && <p className="credit-success">✓ Credits added</p>}
    <AutoTopupIntro settings={controls.settings} />
    <form className="credit-form" onSubmit={e => { e.preventDefault(); void controls.save(true); }}>
      <AutoTopupFields controls={controls} />
      <AutoTopupConsent controls={controls} />
      <div className="credit-form-actions"><button className="pricing-cta pricing-cta-dark" disabled={controls.busy || !controls.consent || controls.credits === null || !data.customCredits?.available}>{controls.busy ? "Opening…" : "Enable auto top-up"}</button>
      {controls.settings.enabled && <button className="button" type="button" disabled={controls.busy} onClick={() => void controls.save(false)}>Turn off</button>}
      <button className="credit-skip" type="button" onClick={onClose}>{purchased ? "Not now" : "Done"}</button></div>
      {controls.error && <p role="alert" className="error-box">{controls.error}</p>}
    </form>
  </CreditDialog>;
}
function AutoTopupIntro({ settings }: { settings: typeof defaults }) {
  const messages: Record<string, string> = {
    ready: "Auto top-up is on.", disabled: "Auto top-up is off.",
    awaiting_setup: "Finish card setup in Stripe to enable auto top-up.",
    needs_attention: "Auto top-up needs attention. Check your payment history before setting it up again. An unconfirmed payment will not be retried automatically.",
  };
  return <div className="credit-dialog-description">
    <p>Keep your balance topped up automatically.</p>
    {settings.enabled && <p>{money(settings.spentThisMonth, "gbp")} used this month</p>}
    {settings.status !== "disabled" && <p role="status">{messages[settings.status]}</p>}
  </div>;
}
function AutoTopupFields({ controls: c }: { controls: Controls }) {
  return <>
    <label>Top-up amount (£)<input type="number" inputMode="decimal" min={amountLimits.minAmount / 100} max={amountLimits.maxAmount / 100} step="0.05" required value={c.amount} onChange={e => { c.setAmount(e.target.value); c.setLimit(Math.max(c.limit, Number(e.target.value))); c.setConsent(false); }} /></label>
    <div className="credit-field-pair"><label>When below (credits)<input type="number" min={1} max={c.credits ?? 1} required value={c.threshold} onChange={e => { c.setThreshold(Number(e.target.value)); c.setConsent(false); }} /></label>
    <label>Monthly limit (£)<input type="number" min={c.pence / 100} max={10000} step="0.01" required value={c.limit} onChange={e => { c.setLimit(Number(e.target.value)); c.setConsent(false); }} /></label></div>
  </>;
}
function AutoTopupConsent({ controls: c }: { controls: Controls }) {
  return <label className="credit-consent"><input type="checkbox" required checked={c.consent} onChange={e => c.setConsent(e.target.checked)} /> Allow {money(c.pence, "gbp")} charges below {c.threshold} credits, up to {money(Math.round(c.limit * 100), "gbp")} per month. Cancel anytime.</label>;
}
