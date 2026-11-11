import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { CommentAuth } from "./useCommentAuth";
import GoogleSignInIcon from "./GoogleSignInIcon";
import "./reader-auth.css";

export default function ReaderAuth({ auth, prompt, children, showSession = true, sessionVerb = "Signed in" }: {
  auth: CommentAuth;
  prompt?: string;
  children?: ReactNode;
  showSession?: boolean;
  sessionVerb?: string;
}) {
  if (auth.loading) return <p role="status">Loading reader sign-in…</p>;
  if (!auth.reader) return <ReaderLogin auth={auth} prompt={prompt} />;
  return <>{children}{showSession && <ReaderSession auth={auth} verb={sessionVerb} />}</>;
}

function ReaderLogin({ auth, prompt }: { auth: CommentAuth; prompt?: string }) {
  const [email, setEmail] = useState("");
  const emailId = useId();
  const hasGoogle = auth.providers.includes("google");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) void auth.signIn("email", email.trim());
  }
  return <div className="reader-auth">
    <p>{prompt || "Sign in to continue."}</p>
    {hasGoogle && <>
      <button type="button" className="button reader-auth-google" disabled={auth.busy} onClick={() => void auth.signIn("google")}>
        <GoogleSignInIcon /> Continue with Google
      </button>
      <div className="reader-auth-divider"><span>or</span></div>
    </>}
    <form className="reader-auth-email" onSubmit={submit}>
      <label htmlFor={emailId}>Email address</label>
      <input id={emailId} required type="email" autoComplete="email" maxLength={254} placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={auth.busy} />
      <button className="button primary" disabled={auth.busy}>{auth.busy ? "Sending…" : "Send sign-in link"}</button>
    </form>
    <p className="small-text">No password needed. Signing in won’t subscribe you to the newsletter.</p>
    {auth.message && <p role="status">{auth.message}</p>}
  </div>;
}

export function ReaderSession({ auth, verb = "Signed in", signOutLabel = "Sign out" }: {
  auth: CommentAuth;
  verb?: string;
  signOutLabel?: string;
}) {
  return <div className="comment-session">
    <span>{auth.reader?.name ? <>{verb} as <strong>{auth.reader.name}</strong></> : "Signed in"}</span>
    <button type="button" className="text-link" disabled={auth.busy} onClick={() => void auth.signOut()}>{signOutLabel}</button>
    {auth.message && <p role="status">{auth.message}</p>}
  </div>;
}
