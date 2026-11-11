import "../newsletter.css";
import type { NewsletterSettingsController } from "./useNewsletterSettings";
type Props = {
  state: Pick<NewsletterSettingsController, "config" | "busy">;
  emailOnly?: boolean;
};
export default function NewsletterActions({ state, emailOnly }: Props) {
  const { config, busy } = state;
  if (!config) return null;
  return (
    <div className="newsletter-actions">
      <button
        className="button primary"
        disabled={
          busy ||
          (config.delivery === "managed" && !config.entitled && config.enabled)
        }
      >
        {busy
          ? "Saving…"
          : emailOnly
            ? "Save email delivery"
            : "Save newsletter settings"}
      </button>
      {!emailOnly && (
        <span>
          {config.subscriberCount} confirmed{" "}
          {config.subscriberCount === 1 ? "subscriber" : "subscribers"}
        </span>
      )}
    </div>
  );
}
