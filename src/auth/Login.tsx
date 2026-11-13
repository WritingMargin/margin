import PublicationTypeField from "../settings/PublicationTypeField";
import { sitePath } from "../base-path";
import LoginLayout from "./LoginLayout";
import { ArrowRight, BookOpen, Loader2, ShieldCheck } from "lucide-react";
import LoginPassword from "./LoginPassword";

import { useLogin } from "./useLogin";
export default function Login(
  props: Parameters<typeof useLogin>[0] & {
    cloudManaged?: boolean;
    teamConnected?: boolean;
    teamPasswordRecoveryUrl?: string;
    passwordRecoveryUrl?: string;
  },
) {
  const state = useLogin(props);
  const {
    submit,
    setup,
    email,
    setEmail,
    setupToken,
    setSetupToken,
    error,
    busy,
  } = state;
  return (
    <LoginLayout cloudManaged={props.cloudManaged}>
      <form className="login-card" onSubmit={submit}>
        <BookOpen size={25} />
        <h2>{setup ? "Make yourself at home." : "Welcome back."}</h2>
        <p>
          {setup
            ? "Create the owner account for your publication."
            : props.cloudManaged
              ? "Sign in with the same email and password you used to create your Margin account."
              : props.teamConnected
                ? "Teammates sign in with their Margin account. The publication owner uses their existing local login."
                : "Sign in to your writing workspace."}
        </p>
        <label>
          Email address
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
          />
        </label>
        {setup && (
          <PublicationTypeField
            value={state.publicationType}
            onChange={state.setPublicationType}
          />
        )}
        <label htmlFor="login-password">Password</label>
        <LoginPassword state={state} />
        {setup && (
          <label>
            Setup token <span className="muted">if configured</span>
            <input
              type="password"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              placeholder="From your server environment"
            />
          </label>
        )}
        {error && <div className="error-box">{error}</div>}
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <>
              {setup ? "Create your workspace" : "Sign in"}
              <ArrowRight size={16} />
            </>
          )}
        </button>
        <PasswordRecoveryLink
          setup={setup}
          cloudManaged={props.cloudManaged}
          url={props.passwordRecoveryUrl}
        />
        <div className="login-foot">
          <ShieldCheck size={14} /> Private workspace. Your content stays yours.
        </div>
      </form>
    </LoginLayout>
  );
}

function PasswordRecoveryLink({
  setup,
  cloudManaged,
  url,
}: {
  setup: boolean;
  cloudManaged?: boolean;
  url?: string;
}) {
  if (setup) return null;
  return (
    <a
      className="login-recovery-link"
      href={cloudManaged ? url : sitePath("/admin/forgot-password")}
    >
      Forgot password?
    </a>
  );
}
