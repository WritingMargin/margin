import { useState } from "react";
import { api, json } from "../api";

export function useOwnerEmailVerification(refresh: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>("/account/email-verification", json("POST", {}));
      setMessage(result.message);
      await refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, error, send };
}
