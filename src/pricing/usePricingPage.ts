import { useCallback,useEffect,useRef,useState } from "react";
import type { Pricing } from "../../shared/pricing";
import { api,json } from "../api";
import { useConfirmation } from "../admin/useConfirmation";
import { money } from "./format";
import "../pricing.css";
import { useCreditPurchase } from "./useCreditPurchase";

export function usePricingPage() {
  const confirmation = useConfirmation();
  const [data, setData] = useState<Pricing | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [checkoutNotice, setCheckoutNotice] = useState<{ id: string; message: string } | null>(null);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Pricing>("/ai/pricing"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  const purchase = useCreditPurchase(refresh);
  useEffect(() => { if (purchase.confirmed) setCheckoutNotice(null); }, [purchase.confirmed]);
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15_000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  async function checkout(id: string, kind: "plan" | "topup" | "manage" | "change", amount?: number) {
    if (inFlight.current) return;
    if (kind === "change" && !await confirmPlanChange(data, id, confirmation.ask)) return;
    inFlight.current = true;
    setBusy(id);
    setError("");
    setCheckoutNotice(null);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      if (!tab) throw new Error("Allow a new tab to open secure checkout.");
      const result = await requestCheckout(id, kind, amount);
      const url = checkoutURL(result.url);
      if (result.purchaseId) purchase.track(result.purchaseId);
      tab.location.href = url;
      tab.focus();
      setCheckoutNotice({ id, message: "Checkout opened. Credits update after payment." });
      return true;
    } catch (e) {
      tab?.close();
      setError((e as Error).message);
      setCheckoutNotice({ id, message: (e as Error).message });
      return false;
    } finally {
      inFlight.current = false;
      setBusy("");
    }
  }
  const current = data?.account.planId;
  const existing = Boolean(
    data?.account.canManage &&
    !["canceled", "incomplete_expired"].includes(
      data.account.subscriptionStatus || "",
    ),
  );
  return { data, error, loading, busy, checkoutNotice, refresh, checkout, current, existing, confirmation, purchase };
}
export type PricingPageController = ReturnType<typeof usePricingPage>;

function requestCheckout(id: string, kind: "plan" | "topup" | "manage" | "change", amount?: number) {
  const endpoint = {
    manage: "/ai/billing/portal",
    change: "/ai/billing/portal",
    topup: "/ai/topups",
    plan: "/ai/checkout",
  }[kind];
  const payload =
    kind === "topup" ? (amount === undefined ? { packId: id } : { amount }) : kind === "plan" || kind === "change" ? { planId: id } : {};
  return api<{ url: string; purchaseId?: string }>(endpoint, json("POST", payload));
}

function confirmPlanChange(data: Pricing | null, id: string, ask: ReturnType<typeof useConfirmation>["ask"]) {
  const plan = [...(data?.plans ?? []), ...(data?.hostingPlans ?? [])].find(p => p.id === id);
  if (!plan) return false;
  return ask({ title: `Change to ${plan.name}?`, description: `${money(plan.amount, plan.currency)} per month. The remaining part of this billing month is charged now. Your other subscription items stay unchanged.`, confirmLabel: "Continue to payment", cancelLabel: "Keep current plan" });
}

function checkoutURL(address: string) {
  const url = new URL(address);
  if (url.protocol !== "https:" || !["checkout.stripe.com", "billing.stripe.com", "invoice.stripe.com"].includes(url.hostname)) throw new Error("Checkout returned an unexpected address.");
  return url.href;
}
