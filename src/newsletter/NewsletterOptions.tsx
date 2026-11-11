import Select from "../components/Select";
import type { NewsletterSettingsController } from "./useNewsletterSettings";
import SMTPOptions from "./SMTPOptions";
import SenderDomainSettings from "./SenderDomainSettings";
import "../newsletter.css";
type Props = {
  state: Pick<
    NewsletterSettingsController,
    | "config"
    | "custom"
    | "setCustom"
    | "busy"
    | "setMessage"
    | "setDirty"
    | "update"
    | "verifyDomain"
    | "testSMTP"
    | "dirty"
  >;
};
export default function NewsletterOptions({ state }: Props) {
  const { config, custom, setCustom, busy, setMessage, setDirty, update } =
    state;
  if (!config) return null;
  if (config.delivery === "smtp") return <SMTPOptions state={state} />;
  return (
    <div className="newsletter-options">
      <label>
        Send from
        <Select
          disabled={busy}
          value={custom ? "custom" : "default"}
          onChange={(e) => {
            setCustom(e.target.value === "custom");
            setDirty(true);
            setMessage("");
          }}
        >
          <option value="default">Your Margin address</option>
          <option value="custom">Your own domain</option>
        </Select>
      </label>
      {custom ? (
        <>
          <label>
            Sender email
            <input
              disabled={busy}
              type="email"
              maxLength={254}
              required
              value={config.senderEmail}
              onChange={(e) =>
                update({ senderEmail: e.target.value, domain: null })
              }
              placeholder="newsletter@yourdomain.com"
            />
          </label>
          <SenderDomainSettings
            email={config.senderEmail}
            domain={config.domain}
            busy={busy}
            verify={state.verifyDomain}
          />
        </>
      ) : (
        <div className="newsletter-sender">
          <span>Your blog’s sender address</span>
          <strong>
            {config.defaultSenderEmail ||
              "Available when Margin email is connected"}
          </strong>
        </div>
      )}
      <p className="small-text">
        Margin handles email delivery. Your default address is based on your
        blog name and reserved for your account.
      </p>
    </div>
  );
}
