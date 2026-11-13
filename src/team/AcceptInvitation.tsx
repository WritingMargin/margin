import { useState, type FormEvent } from "react";
import { api, json } from "../api";
import { sitePath } from "../base-path";
import { ArrowRight, BookOpen, Loader2, ShieldCheck } from "lucide-react";
import LoginLayout from "../auth/LoginLayout";
import LoginPassword from "../auth/LoginPassword";
export default function AcceptInvitation({
  centralOrigin,
}: {
  centralOrigin?: string;
}) {
  const token = new URLSearchParams(location.search).get("token") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function accept(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        "/public/team/accept",
        json("POST", { token, email, password }),
      );
      // The workspace routes the accepted role after loading its session.
      // Do not turn a successful, single-use acceptance into a retry if a
      // second session request fails.
      location.replace(sitePath("/admin"));
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  return (
    <LoginLayout cloudManaged>
      <form className="login-card" onSubmit={(event) => void accept(event)}>
        <BookOpen size={25} />
        <h2>Join this publication</h2>
        <p>
          Sign in with the Margin account for the invited email address. Your
          account and password work across publications; access is granted
          separately for each one.
        </p>
        <label>
          Email address
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label htmlFor="login-password">Password</label>
        <LoginPassword
          state={{
            setup: false,
            password,
            setPassword,
            showPassword,
            setShowPassword,
          }}
        />
        {!token && (
          <p className="error-box" role="alert">
            This invitation link is incomplete. Ask the publication owner for a
            new invitation.
          </p>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <button className="button primary full" disabled={busy || !token}>
          {busy ? (
            <>
              <Loader2 className="spin" size={16} />
              Joining…
            </>
          ) : (
            <>
              Accept invitation
              <ArrowRight size={16} />
            </>
          )}
        </button>
        {centralOrigin && (
          <>
            <p>
              New to Margin?{" "}
              <a
                href={`${centralOrigin}/join`}
                target="_blank"
                rel="noreferrer"
              >
                Create your Margin account
              </a>
              , verify your email, then return here to accept.
            </p>
            <a
              className="login-recovery-link"
              href={`${centralOrigin}/forgot-password`}
              target="_blank"
              rel="noreferrer"
            >
              Forgot password?
            </a>
          </>
        )}
        <div className="login-foot">
          <ShieldCheck size={14} />
          Private workspace. Access is specific to this publication.
        </div>
      </form>
    </LoginLayout>
  );
}
