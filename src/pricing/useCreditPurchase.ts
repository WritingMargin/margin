import { useEffect, useState } from "react";
import { api, json } from "../api";
import type { CreditPurchase } from "../../shared/credit-purchase";
import { sitePath } from "../base-path";

const pendingKey = sitePath("/billing/pending-credit-purchase");
function savedPurchase() {
  const returned = new URLSearchParams(window.location.search).get("creditPurchase");
  try { return returned || sessionStorage.getItem(pendingKey) || ""; } catch { return returned || ""; }
}
function dismissed(id: string) {
  try { return localStorage.getItem(`margin-credit-purchase:${id}`) === "dismissed"; } catch { return false; }
}
export function useCreditPurchase(refresh: () => Promise<void>) {
  const [id, setId] = useState(savedPurchase);
  const [confirmed, setConfirmed] = useState<CreditPurchase | null>(null);
  const [pending, setPending] = useState(Boolean(id));
  useEffect(() => {
    if (!id || dismissed(id)) { setPending(false); return; }
    let active = true, inFlight = false, done = false;
    const check = async () => {
      if (inFlight || done || document.hidden) return;
      inFlight = true;
      try {
        const purchase = await api<CreditPurchase>("/ai/topups/status", json("POST", { purchaseId: id }));
        if (!active || purchase.id !== id || !purchase.fulfilled) return;
        done = true;
        await refresh();
        if (active) { setPending(false); if (!dismissed(id)) setConfirmed(purchase); }
      } catch { /* Checkout and webhook confirmation can arrive at different times. */ }
      finally { inFlight = false; }
    };
    void check();
    const timer = window.setInterval(() => void check(), 5000);
    window.addEventListener("focus", check);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", check); };
  }, [id, refresh]);
  function track(purchaseId: string) {
    try { sessionStorage.setItem(pendingKey, purchaseId); } catch { /* In-memory tracking still works. */ }
    setConfirmed(null); setPending(true); setId(purchaseId);
  }
  function dismiss() {
    if (id) {
      try { localStorage.setItem(`margin-credit-purchase:${id}`, "dismissed"); sessionStorage.removeItem(pendingKey); } catch { /* Dismiss for this visit. */ }
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("creditPurchase"); url.searchParams.delete("aiCredits");
    window.history.replaceState(window.history.state, "", url);
    setConfirmed(null); setPending(false); setId("");
  }
  return { confirmed, pending, track, dismiss };
}
