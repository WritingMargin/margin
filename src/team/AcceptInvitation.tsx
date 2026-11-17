import { useEffect, useState, type FormEvent } from "react";
import { api, json } from "../api";
import { sitePath } from "../base-path";
import { ArrowRight, BookOpen, Loader2, ShieldCheck } from "lucide-react";
import { teamRoleLabels, type TeamRole } from "../../shared/team";
import LoginLayout from "../auth/LoginLayout";
import LoginPassword from "../auth/LoginPassword";

type Invitation = { email: string; role: TeamRole; articleId?: string; accountExists: boolean };

function useInvitationAcceptance() {
  const token = new URLSearchParams(location.search).get("token") || "";
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setError("");
    api<Invitation>(`/public/team/invitation?token=${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setInvitation(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [token, attempt]);
  const setup = invitation?.accountExists === false;
  async function accept(event: FormEvent) {
    event.preventDefault();
    if (busy || !invitation) return;
    setError("");
    if (setup && password !== confirmation) { setError("The passwords don’t match."); return; }
    if (setup && new TextEncoder().encode(password).length > 72) { setError("Use a password of at most 72 UTF-8 bytes."); return; }
    setBusy(true);
    try {
      await api("/public/team/accept", json("POST", { token, email: invitation.email, password, ...(setup ? { name } : {}) }));
      // Acceptance creates the session. Navigation must not replay the single-use invitation.
      location.replace(sitePath("/admin"));
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  return { token, invitation, name, setName, password, setPassword, confirmation, setConfirmation, showPassword, setShowPassword, setup, busy, error, accept, retry: () => setAttempt(value => value + 1) };
}

export default function AcceptInvitation() {
  const state = useInvitationAcceptance();
  return <LoginLayout>
    <form className="login-card" onSubmit={event => void state.accept(event)}>
      <BookOpen size={25} />
      <h2>Join this publication</h2>
      <InvitationDescription invitation={state.invitation} />
      {state.invitation && <InvitationFields state={state} />}
      <InvitationStateMessages state={state} />
      {state.invitation && <button className="button primary full" disabled={state.busy}>
        {state.busy ? <><Loader2 className="spin" size={16} />Joining…</> : <>{state.setup ? "Create account and join" : "Sign in and accept invitation"}<ArrowRight size={16} /></>}
      </button>}
      {state.invitation?.accountExists && <a className="login-recovery-link" href={sitePath("/admin/forgot-password")}>Forgot password?</a>}
      <div className="login-foot"><ShieldCheck size={14} />Private workspace. Access is specific to this publication.</div>
    </form>
  </LoginLayout>;
}

function InvitationDescription({ invitation }: { invitation: Invitation | null }) {
  if (!invitation) return null;
  return <>
    <p>{invitation.accountExists ? "Sign in with your existing account for this publication to accept." : "Create an account for this publication to accept your invitation. Accounts on other publications stay separate."}</p>
    <p>You’re invited as <strong>{teamRoleLabels[invitation.role]}</strong>.{invitation.role === "peer_reviewer" && " This review invitation grants access only to its assigned article."}</p>
  </>;
}

function InvitationFields({ state }: { state: ReturnType<typeof useInvitationAcceptance> }) {
  return <>
    <label>Email address<input type="email" required autoComplete="username" value={state.invitation?.email || ""} readOnly /></label>
    {state.setup && <label>Your name<input autoComplete="name" maxLength={80} value={state.name} onChange={event => state.setName(event.target.value)} /></label>}
    <label htmlFor="login-password">{state.setup ? "Choose a password" : "Password"}</label>
    <LoginPassword state={state} />
    {state.setup && <label>Confirm password<input type={state.showPassword ? "text" : "password"} autoComplete="new-password" required value={state.confirmation} onChange={event => state.setConfirmation(event.target.value)} /></label>}
  </>;
}

function InvitationStateMessages({ state }: { state: ReturnType<typeof useInvitationAcceptance> }) {
  return <>
      {!state.token && <p className="error-box" role="alert">This invitation link is incomplete. Ask the publication owner for a new invitation.</p>}
      {state.token && !state.invitation && !state.error && <p role="status">Checking your invitation…</p>}
      {state.error && <p role="alert" className="error-box">{state.error}</p>}
      {state.error && !state.invitation && <button className="button" type="button" onClick={state.retry}>Try again</button>}
  </>;
}
