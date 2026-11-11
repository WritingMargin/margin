import { useEffect, useState } from "react";
import { api, json } from "../api";
import { sitePath } from "../base-path";
import "./owner-email.css";

export default function VerifyOwnerEmail() {
  const [token] = useState(() => typeof location === "undefined" ? "" : location.hash.slice(1));
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const valid = /^[a-f0-9]{64}$/.test(token);
  useEffect(() => {
    history.replaceState(null, "", location.pathname + location.search);
  }, []);
  const verify = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setError("");
    try {
      await api("/public/owner-email/verify", json("POST", { token }));
      setVerified(true);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="owner-email-page">
      <section className="login-card">
        <h1>{verified ? "Email verified" : "Verify your email"}</h1>
        <p>{verified ? "Your owner email address is confirmed. You can return to your workspace." : valid ? "Confirm this email address for your owner account. This will not sign you in." : "Open the complete verification link from your email, or sign in to request a new one."}</p>
        {error && <p className="error-box" role="alert">{error}</p>}
        {!verified && valid && <button className="button primary" disabled={busy} onClick={() => void verify()}>{busy ? "Verifying…" : "Verify my email"}</button>}
        <a className="button" href={sitePath("/admin")}>{verified ? "Continue to workspace" : "Back to sign in"}</a>
      </section>
    </main>
  );
}
