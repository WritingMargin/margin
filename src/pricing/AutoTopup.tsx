import { useState } from "react";
import { api, json } from "../api";
import type { Pricing } from "../../shared/pricing";
import type { PricingPageController } from "./usePricingPage";
import { money } from "./format";

const defaults = { enabled: false, status: "disabled", packId: "", threshold: 20, monthlyLimit: 2000, spentThisMonth: 0 };
const emptyPack = { id: "", credits: 0, amount: 0, currency: "gbp", available: false };
function useAutoTopup(data: Pricing, refresh: () => Promise<void>) {
  const settings = data.autoTopup || defaults;
  const [packId, setPackId] = useState(settings.packId || data.topups[0]?.id || "");
  const [threshold, setThreshold] = useState(settings.threshold || 20);
  const [limit, setLimit] = useState((settings.monthlyLimit || 2000) / 100);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pack = data.topups.find(p => p.id === packId) || emptyPack;
  async function save(enabled: boolean) {
    setBusy(true); setError("");
    try {
      await applySettings(enabled, { packId, threshold, monthlyLimit: Math.round(limit * 100), consent });
      setConsent(false); await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return { settings, pack, packId, threshold, limit, consent, busy, error, save, setPackId, setThreshold, setLimit, setConsent };
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
export default function AutoTopup({ state }: { state: PricingPageController }) {
  const data = state.data!;
  const controls = useAutoTopup(data, state.refresh);
  return <section className="pricing-topups" aria-labelledby="auto-topup-title">
    <AutoTopupIntro settings={controls.settings} />
    <form className="pricing-topup-packs" onSubmit={e => { e.preventDefault(); void controls.save(true); }}>
      <AutoTopupFields controls={controls} packs={data.topups} />
      <AutoTopupConsent controls={controls} />
      <button className="button" disabled={controls.busy || !controls.consent || !controls.pack.available}>Set up auto top-up</button>
      <button className="button" type="button" disabled={controls.busy} onClick={() => void controls.save(false)}>Turn off auto top-up</button>
      {controls.error && <p role="alert" className="error-box">{controls.error}</p>}
    </form>
  </section>;
}
function AutoTopupIntro({ settings }: { settings: typeof defaults }) {
  const messages: Record<string, string> = {
    ready: "Auto top-up is on.", disabled: "Auto top-up is off.",
    awaiting_setup: "Finish card setup in Stripe to enable auto top-up.",
    needs_attention: "Auto top-up needs attention. Check your payment history before setting it up again. An unconfirmed payment will not be retried automatically.",
  };
  return <div className="pricing-topup-intro">
    <h2 id="auto-topup-title">Optional auto top-up</h2>
    <p>Automatically buy your chosen pack when credits run low. Off until you opt in and finish secure card setup.</p>
    <p>Spent or reserved this month: {money(settings.spentThisMonth, "gbp")}.</p>
    <p role="status">{messages[settings.status]}</p>
    <p>The cap applies to automatic purchases in each calendar month (UTC). Manual purchases are separate. A payment already in progress may complete after you turn this off.</p>
  </div>;
}
function AutoTopupFields({ controls: c, packs }: { controls: Controls; packs: Pricing["topups"] }) {
  return <>
    <label>Credit pack<select value={c.packId} onChange={e => { c.setPackId(e.target.value); c.setConsent(false); }}>
      {packs.map(p => <option key={p.id} value={p.id} disabled={!p.available}>{p.credits.toLocaleString("en-GB")} credits — {money(p.amount, p.currency)}</option>)}
    </select></label>
    <label>Top up below this balance<input type="number" min={1} max={c.pack.credits} required value={c.threshold} onChange={e => { c.setThreshold(Number(e.target.value)); c.setConsent(false); }} /></label>
    <label>Monthly auto-top-up limit (£)<input type="number" min={c.pack.amount / 100} max={10000} step="0.01" required value={c.limit} onChange={e => { c.setLimit(Number(e.target.value)); c.setConsent(false); }} /></label>
  </>;
}
function AutoTopupConsent({ controls: c }: { controls: Controls }) {
  return <label><input type="checkbox" required checked={c.consent} onChange={e => c.setConsent(e.target.checked)} /> I authorise purchases of {c.pack.credits.toLocaleString("en-GB")} credits for {money(c.pack.amount, "gbp")} when my balance falls below {c.threshold}, up to {money(Math.round(c.limit * 100), "gbp")} per calendar month. I can turn auto top-up off at any time.</label>;
}
