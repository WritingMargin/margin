import Select from "../components/Select";
import AccountGate from "../auth/AccountGate";
import { Mail } from "lucide-react";
import "../newsletter.css";
import NewsletterForm from "./NewsletterForm";
import { useNewsletterSettings } from "./useNewsletterSettings";
import { useEffect } from "react";
export function NewsletterSettings({
  emailOnly = false,
  onDirtyChange,
}: { emailOnly?: boolean; onDirtyChange?: (dirty: boolean) => void } = {}) {
  const state = useNewsletterSettings(emailOnly);
  useEffect(() => {
    onDirtyChange?.(state.dirty);
    return () => onDirtyChange?.(false);
  }, [state.dirty, onDirtyChange]);
  const { config, error } = state;
  return (
    <div className="settings-card newsletter-settings">
      <div className="settings-icon">
        <Mail />
      </div>
      <h2>{emailOnly ? "Email delivery" : "Newsletter & subscriptions"}</h2>
      <p className="newsletter-settings-intro">
        Give readers a way to stay in touch. New subscribers confirm their email
        before joining your list.
      </p>
      {!config ? (
        <p role="status">{error || "Loading newsletter settings…"}</p>
      ) : (
        <>
          <label className="newsletter-delivery-field">
            Delivery method
            <Select
              value={config.delivery}
              disabled={state.busy}
              onChange={(e) =>
                state.update({ delivery: e.target.value as "managed" | "smtp" })
              }
            >
              <option value="managed">Margin email</option>
              <option value="smtp">Your SMTP server</option>
            </Select>
          </label>
          {config.delivery === "managed" ? (
            <AccountGate feature="Margin email" embedded>
              {!config.entitled && <p className="notice newsletter-plan-notice">Margin email requires an active £10 Starter or £50 Studio subscription. Activate your plan in the account settings.</p>}
              <NewsletterForm state={state} emailOnly={emailOnly} />
            </AccountGate>
          ) : (
            <NewsletterForm state={state} emailOnly={emailOnly} />
          )}
        </>
      )}
    </div>
  );
}
