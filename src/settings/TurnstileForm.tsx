import type { CaptchaMode } from "../../shared/captcha";
import type { TurnstileSettingsController } from "./useTurnstileSettings";
import "../turnstile.css";
import AccountGate from "../auth/AccountGate";

type Props = { state: TurnstileSettingsController };
export default function TurnstileForm({ state }: Props) {
  const { status, provider, busy, save, message, changeProvider } = state;
  if (!status) return null;
  const managed = provider === "managed";
  const disabled = busy || (!managed && !status.encryptionAvailable);
  return (
    <form onSubmit={save}>
      <p className={`connection-status ${status.siteKey ? "connected" : ""}`}>
        <i />
        {connectionLabel(status)}
      </p>
      <label htmlFor="captcha-provider">Bot protection</label>
      <select
        id="captcha-provider"
        value={provider}
        disabled={busy}
        onChange={(event) => changeProvider(event.target.value as CaptchaMode)}
      >
        <option value="managed">Managed by Margin</option>
        <option value="turnstile">Own Cloudflare Turnstile</option>
        <option value="recaptcha-v2">Own Google reCAPTCHA v2 (checkbox)</option>
      </select>
      {managed ? (
        <ManagedProtection state={state} />
      ) : (
        <CustomKeys state={state} disabled={disabled} />
      )}
      <ConfigurationIssues state={state} />
      <button className="button primary" disabled={disabled}>
        {busy ? "Saving…" : "Save bot protection"}
      </button>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
function CustomKeys({ state, disabled }: Props & { disabled: boolean }) {
  const {
    status,
    provider,
    siteKey,
    setSiteKey,
    secretKey,
    setSecretKey,
    setMessage,
  } = state;
  const retain = Boolean(
    status?.secretConfigured &&
    provider === status.provider &&
    siteKey.trim() === status.siteKey,
  );
  return (
    <>
      <p className="small-text">
        {provider === "turnstile"
          ? "Use your Cloudflare Turnstile widget keys."
          : "Use Google reCAPTCHA v2 “I'm not a robot” checkbox keys. v3 and Enterprise keys are not supported."}{" "}
        Add your blog hostname in your provider’s settings.
      </p>
      <label htmlFor="captcha-site-key">Site key</label>
      <input
        id="captcha-site-key"
        autoComplete="off"
        spellCheck={false}
        required
        maxLength={512}
        value={siteKey}
        disabled={disabled}
        onChange={(event) => {
          setSiteKey(event.target.value);
          setMessage("");
        }}
        placeholder="Paste your site key"
        aria-describedby="captcha-site-help"
      />
      <p id="captcha-site-help" className="small-text">
        The site key is public and used by the CAPTCHA widget.
      </p>
      <label htmlFor="captcha-secret-key">Secret key</label>
      <input
        id="captcha-secret-key"
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        required={!retain}
        maxLength={512}
        value={secretKey}
        disabled={disabled}
        onChange={(event) => {
          setSecretKey(event.target.value);
          setMessage("");
        }}
        placeholder={
          retain ? "Saved — leave blank to keep" : "Paste your secret key"
        }
        aria-describedby="captcha-secret-help"
      />
      <p id="captcha-secret-help" className="small-text">
        Encrypted in your blog’s database. Your blog verifies directly with the
        provider. The saved secret is never shown again.
      </p>
      <a
        className="text-link"
        href={
          provider === "turnstile"
            ? "https://dash.cloudflare.com/?to=/:account/turnstile"
            : "https://www.google.com/recaptcha/admin/create"
        }
        target="_blank"
        rel="noreferrer"
      >
        Open{" "}
        {provider === "turnstile" ? "Cloudflare Turnstile" : "Google reCAPTCHA"}
      </a>
    </>
  );
}
function connectionLabel(
  status: NonNullable<TurnstileSettingsController["status"]>,
) {
  if (status.provider === "managed")
    return status.siteKey
      ? "Managed by Margin"
      : "Managed protection unavailable";
  return status.secretConfigured
    ? "Custom keys saved securely"
    : "Custom keys need attention";
}

function ConfigurationIssues({ state }: Props) {
  const { status, provider } = state;
  if (!status) return null;
  return (
    <>
      {provider === status.provider && status.issue && (
        <p className="error-box" role="alert">
          {status.issue}
        </p>
      )}
      {provider !== "managed" && !status.encryptionAvailable && (
        <p className="error-box" role="alert">
          Configure the server encryption key before saving your own CAPTCHA
          keys.
        </p>
      )}
    </>
  );
}

function ManagedProtection({ state }: Props) {
  return (
    <>
      <p className="small-text">
        Margin uses Google reCAPTCHA v2 for your connected blog. No
        CAPTCHA keys or paid subscription are needed. Saving this option removes
        any custom keys.
      </p>
      <AccountGate
        feature="Managed bot protection"
        onConnected={() => void state.refresh()}
      >
        <p className="small-text">
          Verification tokens and reader IP addresses are sent to Margin
          and Google. Comments and moderation stay with your blog.
        </p>
      </AccountGate>
    </>
  );
}
