import { useEffect, useState } from "react";
import type { NewsletterStatus, SenderDomain } from "../../shared/newsletter";
import { api, json } from "../api";
import "../newsletter.css";

export function useNewsletterSettings(emailOnly = false) {
  const [config, setConfig] = useState<NewsletterStatus | null>(null);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<NewsletterStatus>("/newsletter/settings")
        .then((value) => {
          if (active) {
            setConfig(value);
            setCustom(!!value.senderEmail);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void load();
    window.addEventListener("margin:account-connected", load);
    return () => {
      window.removeEventListener("margin:account-connected", load);
      active = false;
    };
  }, []);
  const update = (value: Partial<NewsletterStatus>) => {
    setConfig(
      (current) =>
        current && {
          ...current,
          ...value,
          ...(value.delivery ? { issues: [], ready: false } : {}),
        },
    );
    setDirty(true);
    setMessage("");
    setError("");
  };
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!config || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await api<NewsletterStatus>(
        "/newsletter/settings",
        json("PUT", {
          ...(!emailOnly ? { enabled: config.enabled } : {}),
          delivery: config.delivery,
          senderEmail:
            config.delivery === "smtp" || custom
              ? config.senderEmail.trim()
              : "",
          ...(config.delivery === "smtp"
            ? { smtp: smtpInput(config.smtp) }
            : {}),
        }),
      );
      setConfig(saved);
      setCustom(!!saved.senderEmail);
      setDirty(false);
      setMessage(newsletterSaveMessage(saved, emailOnly));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verifyDomain = async (verify: boolean) => {
    if (!config || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const domain = await api<SenderDomain>(
        `/newsletter/domain${verify ? "/verify" : ""}`,
        json("POST", { senderEmail: config.senderEmail.trim() }),
      );
      setConfig((current) => current && { ...current, domain });
      setMessage(
        domain.status === "verified"
          ? "Domain verified. Save your sender settings to use it."
          : "Add the DNS records below, then check verification.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const testSMTP = async () => {
    if (busy || dirty) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>(
        "/newsletter/smtp/test",
        json("POST", {}),
      );
      setMessage(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return {
    save,
    verifyDomain,
    testSMTP,
    config,
    setConfig,
    custom,
    setCustom,
    busy,
    setBusy,
    message,
    setMessage,
    error,
    setError,
    dirty,
    setDirty,
    update,
  };
}
export type NewsletterSettingsController = ReturnType<
  typeof useNewsletterSettings
>;

function smtpInput(smtp: NewsletterStatus["smtp"]) {
  const { passwordConfigured: _configured, ...input } = smtp;
  return input;
}
function newsletterSaveMessage(saved: NewsletterStatus, emailOnly: boolean) {
  if (saved.enabled && !saved.ready) return "Saved. Complete email setup below to open subscriptions.";
  return emailOnly ? "Email delivery settings saved." : "Newsletter settings saved.";
}
