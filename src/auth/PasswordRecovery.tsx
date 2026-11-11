import { useEffect, useState, type FormEvent } from "react";
import { api, json } from "../api";
import { sitePath, unmountPath } from "../base-path";
import "./owner-email.css";
import "./password-recovery.css";

function usePasswordRecovery() {
  const reset =
    unmountPath(location.pathname).replace(/\/+$/, "") ===
    "/admin/reset-password";
  const [token] = useState(() => location.hash.slice(1));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const valid = !reset || /^[a-f0-9]{64}$/.test(token);
  useEffect(() => {
    if (reset) history.replaceState(null, "", location.pathname);
  }, [reset]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !valid) return;
    setError("");
    if (reset && password !== confirm) {
      setError("The passwords don’t match.");
      return;
    }
    if (reset && new TextEncoder().encode(password).length > 72) {
      setError("Use a password of at most 72 UTF-8 bytes.");
      return;
    }
    setBusy(true);
    try {
      const result = await api(
        `/public/password/${reset ? "reset" : "forgot"}`,
        json("POST", reset ? { token, password } : { email }),
      );
      setMessage(result.message);
      setPassword("");
      setConfirm("");
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return {
    reset,
    token,
    email,
    setEmail,
    password,
    setPassword,
    confirm,
    setConfirm,
    busy,
    message,
    error,
    valid,
    submit,
  };
}
type RecoveryState = ReturnType<typeof usePasswordRecovery>;
export default function PasswordRecovery({
  recoveryUrl,
}: {
  recoveryUrl?: string;
}) {
  const state = usePasswordRecovery();
  return (
    <main className="owner-email-page password-recovery-page">
      <section className="login-card" aria-labelledby="password-recovery-title">
        <h1 id="password-recovery-title">{recoveryTitle(state)}</h1>
        {recoveryUrl ? (
          <CentralRecovery url={recoveryUrl} />
        ) : (
          <LocalRecovery state={state} />
        )}
        <a className="password-recovery-back" href={sitePath("/admin")}>
          Back to sign in
        </a>
      </section>
    </main>
  );
}
function recoveryTitle({ message, reset }: RecoveryState) {
  if (message && reset) return "Password updated";
  return reset ? "Choose a new password" : "Forgot your password?";
}
function CentralRecovery({ url }: { url: string }) {
  return (
    <>
      <p>
        Your password is managed by Margin Central. Reset it there, then return
        to your blog to sign in.
      </p>
      <a className="button primary" href={url}>
        Recover your Margin account
      </a>
    </>
  );
}
function LocalRecovery({ state }: { state: RecoveryState }) {
  const { reset, valid, message, error } = state;
  if (message) return <p role="status">{message}</p>;
  return (
    <>
      <p>
        {reset
          ? "Use at least 12 characters for your new password."
          : "Enter your owner email address. We’ll send a reset link if the address is verified and email delivery is configured."}
      </p>
      {!valid && (
        <p role="alert">
          This reset link is incomplete. Open the full link from your email or
          request a new one.
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <RecoveryForm state={state} />
      <p className="password-recovery-help">
        If you cannot receive recovery email, contact the person who runs this
        publication.
      </p>
      {reset && !message && (
        <a
          className="password-recovery-again"
          href={sitePath("/admin/forgot-password")}
        >
          Request a new reset link
        </a>
      )}
    </>
  );
}
function RecoveryForm({ state }: { state: RecoveryState }) {
  const {
    reset,
    message,
    valid,
    submit,
    email,
    setEmail,
    password,
    setPassword,
    confirm,
    setConfirm,
    busy,
  } = state;
  if (message || !valid) return null;
  return (
    <form className="password-recovery-form" onSubmit={submit}>
      {reset ? (
        <>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={72}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        </>
      ) : (
        <label>
          Email address
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      )}
      <button className="button primary" disabled={busy}>
        {busy
          ? "Please wait…"
          : reset
            ? "Save new password"
            : "Send reset link"}
      </button>
    </form>
  );
}
