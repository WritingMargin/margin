import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import type { OwnerEmailStatus } from "../../shared/owner-email";
import { api } from "../api";
import { sitePath } from "../base-path";
import { useOwnerEmailVerification } from "../auth/useOwnerEmailVerification";

export default function ProfileAccount() {
  const [owner, setOwner] = useState<OwnerEmailStatus | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const refresh = async () => { setOwner(await api<OwnerEmailStatus>("/account/email-verification")); };
  const verification = useOwnerEmailVerification(refresh);
  useEffect(() => {
    const request = new AbortController();
    setError("");
    api<OwnerEmailStatus>("/account/email-verification", { signal: request.signal })
      .then(value => { if (!request.signal.aborted) setOwner(value); })
      .catch(error => { if (!request.signal.aborted) setError(error.message); });
    return () => request.abort();
  }, [attempt]);
  return <div className="profile-account">
    <section className="settings-card" aria-labelledby="profile-account-title">
      <div className="profile-section-heading"><Mail size={20} /><h2 id="profile-account-title">Email address</h2><span className="profile-private">Private</span></div>
      <p>Your sign-in email is separate from your public profile.</p>
      {error && <p className="error-box" role="alert">{error} <button className="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></p>}
      {owner && <div className="profile-account-row">
        <div><strong>{owner.email}</strong><span className={`profile-verification ${owner.verified ? "verified" : ""}`}>{owner.verified ? <><CheckCircle2 size={14} />Verified</> : "Verification pending"}</span></div>
        {!owner.verified && <button className="button" disabled={verification.busy} onClick={() => void verification.send()}>{verification.busy ? "Sending…" : "Send verification email"}</button>}
      </div>}
      {verification.message && <p role="status">{verification.message}</p>}
      {verification.error && <p className="error-box" role="alert">{verification.error}</p>}
      <p><a href={sitePath("/admin/readers?tab=settings")}>Email delivery settings</a></p>
    </section>
    <section className="settings-card" aria-labelledby="profile-security-title">
      <div className="profile-section-heading"><ShieldCheck size={20} /><h2 id="profile-security-title">Account security</h2></div>
      <div className="profile-account-row"><div><strong>Password</strong><p>Use the secure recovery flow to choose a new password.</p></div><a className="button" href={sitePath("/admin/forgot-password")}>Reset password</a></div>
      <div className="profile-account-row"><div><strong>Connected tools</strong><p>Review API tokens and apps that can access your publication.</p></div><a className="button" href={sitePath("/admin/settings?tab=integrations")}><KeyRound size={15} />Manage access</a></div>
    </section>
  </div>;
}
