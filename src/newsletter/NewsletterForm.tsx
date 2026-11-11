import "../newsletter.css";
import NewsletterActions from "./NewsletterActions";
import NewsletterFeedback from "./NewsletterFeedback";
import NewsletterOptions from "./NewsletterOptions";
import type { NewsletterSettingsController } from "./useNewsletterSettings";
type Props = {
  emailOnly?: boolean;
  state: Pick<
    NewsletterSettingsController,
    | "save"
    | "verifyDomain"
    | "testSMTP"
    | "config"
    | "busy"
    | "message"
    | "error"
    | "dirty"
    | "update"
    | "custom"
    | "setDirty"
    | "setCustom"
    | "setMessage"
  >;
};
export default function NewsletterForm({ state, emailOnly = false }: Props) {
  const { save, config, busy, update } = state;
  if (!config) return null;
  return (
    <form onSubmit={save}>
      {!emailOnly && (
        <label className="newsletter-toggle">
          <span>
            <strong>Enable subscriptions</strong>
            <small>Show an email signup on your blog.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={config.enabled}
            disabled={
              busy ||
              (config.delivery === "managed" &&
                !config.entitled &&
                !config.enabled)
            }
            onChange={(e) => update({ enabled: e.target.checked })}
          />
        </label>
      )}
      <NewsletterOptions state={state} />
      <NewsletterActions state={state} emailOnly={emailOnly} />
      {!emailOnly && !config.enabled && (
        <p className="small-text">
          Turning subscriptions off hides the signup form and keeps your
          existing subscribers.
        </p>
      )}
      <NewsletterFeedback state={state} />
    </form>
  );
}
