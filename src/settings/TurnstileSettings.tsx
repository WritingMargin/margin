import { ShieldCheck } from "lucide-react";
import "../turnstile.css";
import TurnstileForm from "./TurnstileForm";
import { useTurnstileSettings } from "./useTurnstileSettings";
import { useEffect } from "react";

export default function TurnstileSettings({
  onDirtyChange,
}: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  const state = useTurnstileSettings();
  const { status, error } = state;
  const dirty = Boolean(
    status &&
    (state.provider !== status.provider ||
      state.siteKey !== status.siteKey ||
      state.secretKey),
  );
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  return (
    <div className="settings-card turnstile-settings">
      <div className="settings-icon">
        <ShieldCheck />
      </div>
      <h2>Protect reader conversations</h2>
      <p>
        Use Margin’s managed bot protection, or connect your own Cloudflare
        Turnstile or Google reCAPTCHA keys for comments and passage questions.
      </p>
      {status ? (
        <TurnstileForm state={state} />
      ) : (
        !error && <p role="status">Loading bot protection settings…</p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <p className="small-text">
        Enable comments or passage questions in the reading experience settings
        above. Email verification and approval follow your conversation rules.
      </p>
    </div>
  );
}
