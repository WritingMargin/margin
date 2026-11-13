import { useCallback,useEffect,useRef,useState } from "react";
import type { Pricing } from "../../shared/pricing";
import { api,json } from "../api";
import { useConfirmation } from "../admin/useConfirmation";
import { money } from "./format";
import "../pricing.css";

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
  async function checkout(id: string, kind: "plan" | "topup" | "manage" | "change") {
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
      const result = await requestCheckout(id, kind);
      const url = new URL(result.url);
      if (
        url.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com", "invoice.stripe.com"].includes(url.hostname)
      )
        throw new Error("Checkout returned an unexpected address.");
      tab.location.href = url.href;
      tab.focus();
      setCheckoutNotice({ id, message: "Secure checkout opened in a new tab. Return here after payment." });
    } catch (e) {
      tab?.close();
      setError((e as Error).message);
      setCheckoutNotice({ id, message: (e as Error).message });
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
  return { data, error, loading, busy, checkoutNotice, refresh, checkout, current, existing, confirmation };
}
export type PricingPageController = ReturnType<typeof usePricingPage>;

function requestCheckout(id: string, kind: "plan" | "topup" | "manage" | "change") {
  const endpoint = {
    manage: "/ai/billing/portal",
    change: "/ai/billing/portal",
    topup: "/ai/topups",
    plan: "/ai/checkout",
  }[kind];
  const payload =
    kind === "topup" ? { packId: id } : kind === "plan" || kind === "change" ? { planId: id } : {};
  return api<{ url: string }>(endpoint, json("POST", payload));
}

function confirmPlanChange(data: Pricing | null, id: string, ask: ReturnType<typeof useConfirmation>["ask"]) {
  const plan = [...(data?.plans ?? []), ...(data?.hostingPlans ?? [])].find(p => p.id === id);
  if (!plan) return false;
  return ask({ title: `Change to ${plan.name}?`, description: `${money(plan.amount, plan.currency)} per month. The remaining part of this billing month is charged now. Your other subscription items stay unchanged.`, confirmLabel: "Continue to payment", cancelLabel: "Keep current plan" });
}
