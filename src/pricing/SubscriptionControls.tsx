import { isHostingPlan, isLegacyPlan } from "../../shared/plans";
import { useState } from "react";
import { api, json } from "../api";
import type { PricingPageController } from "./usePricingPage";
import ConfirmDialog from "../admin/ConfirmDialog";
import { useConfirmation } from "../admin/useConfirmation";
import { CalendarOff } from "lucide-react";
export default function SubscriptionControls({ state }: { state: PricingPageController }) {
  const account = state.data?.account;
  if (!account?.canManage || isLegacyPlan(account.planId)) return null;
  return <div className="pricing-account-actions">
    {hasHosting(state) && <StopRenewal component="hosting" stopped={!!account.hostingRenewalStopped} refresh={state.refresh} />}
  </div>;
}
function StopRenewal({ component, stopped, refresh }: { component: "ai" | "hosting"; stopped: boolean; refresh: () => Promise<void> }) {
  const confirmation = useConfirmation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = component === "ai" ? "AI" : "hosting";
  async function stop() {
    if (!await confirmation.ask({ title: `Stop ${name} renewal?`, description: "Access continues until the paid-through date. Your other subscription component stays active.", confirmLabel: "Stop renewal", cancelLabel: "Keep subscription" })) return;
    setBusy(true);
    try { await api("/ai/billing/stop", json("POST", { component })); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div><ConfirmDialog confirmation={confirmation} icon={<CalendarOff size={21} />} />{stopped ? <p className="small-text">{name} renewal stopped. Access continues until the paid-through date.</p> : <button type="button" className="button" disabled={busy} onClick={() => void stop()}>{busy ? "Updating…" : `Stop ${name} renewal`}</button>}{error && <div className="error-box" role="alert">{error}</div>}</div>;
}

function hasHosting(state: PricingPageController) { return state.data?.audience === "hosting" && isHostingPlan(state.data.account.hostingPlanId); }
