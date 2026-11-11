import { useEffect, useState } from "react";
import { api, json } from "../api";
import "../turnstile.css";
import type { CaptchaMode } from "../../shared/captcha";
type Status = {
  provider: CaptchaMode;
  siteKey: string;
  secretConfigured: boolean;
  source: string;
  encryptionAvailable: boolean;
  issue: string;
};
export function useTurnstileSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [provider, setProvider] = useState<CaptchaMode>("managed");
  const [siteKey, setSiteKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    api<Status>("/settings/captcha")
      .then((value) => {
        if (active) {
          setStatus(value);
          setProvider(value.provider);
          setSiteKey(value.siteKey);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await api<Status>(
        "/settings/captcha",
        json(
          "PUT",
          provider === "managed"
            ? { provider }
            : {
                provider,
                siteKey: siteKey.trim(),
                secretKey: secretKey.trim(),
              },
        ),
      );
      setStatus(saved);
      setProvider(saved.provider);
      setSiteKey(saved.siteKey);
      setSecretKey("");
      setMessage("Bot protection settings saved. Changes apply immediately.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return {
    save,
    refresh: async () => {
      try {
        const value = await api<Status>("/settings/captcha");
        setStatus(value);
        if (provider === value.provider) setSiteKey(value.siteKey);
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    },
    provider,
    changeProvider: (next: CaptchaMode) => {
      setProvider(next);
      setSiteKey(next === status?.provider ? status.siteKey : "");
      setSecretKey("");
      setMessage("");
    },
    status,
    setStatus,
    siteKey,
    setSiteKey,
    secretKey,
    setSecretKey,
    busy,
    setBusy,
    error,
    setError,
    message,
    setMessage,
  };
}
export type TurnstileSettingsController = ReturnType<
  typeof useTurnstileSettings
>;
