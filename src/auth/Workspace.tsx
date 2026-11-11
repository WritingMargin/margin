import { sitePath, unmountPath } from "../base-path";
import PasswordRecovery from "./PasswordRecovery";
import VerifyOwnerEmail from "./VerifyOwnerEmail";
import BrandMark from "../BrandMark";
import Admin from "../admin/Admin";
import { api, json } from "../api";
import Login from "../auth/Login";
import OAuthReturn from "./OAuthReturn";
import CLIConnect from "./CLIConnect";
import { useWorkspace } from "./useWorkspace";
import { prepareOfflineWriter } from "../offline-writer";
import { useEffect } from "react";

export default function Workspace() {
  const { session, setSession, error, setError, refreshSession, offline, forgetOfflineSession } =
    useWorkspace();
  useOfflineWriter(session, offline);
  const recovery = recoveryPage(session);
  if (recovery) return recovery;
  if (!session)
    return (
      <div className="loading-screen">
        <BrandMark />
        <p>{error || "Opening your workspace…"}</p>
        {error && <button onClick={() => location.reload()}>Try again</button>}
      </div>
    );
  if (!session.authenticated)
    return (
      <Login
        key={session.setupRequired ? "setup" : "login"}
        setup={session.setupRequired}
        cloudManaged={session.cloudManaged}
        passwordRecoveryUrl={session.passwordRecoveryUrl}
        onLogin={refreshSession}
      />
    );
  const oauthQuery = new URLSearchParams(location.search).get("oauthAuthorize");
  if (oauthQuery) return <OAuthReturn query={oauthQuery} />;
  const cliCode = new URLSearchParams(location.search).get("cliCode");
  if (cliCode) return <CLIConnect code={cliCode} />;
  return (
    <>
      {error && (
        <div className="workspace-unavailable" role="alert">
          <div>
            <BrandMark />
            <h1>Let’s reconnect your workspace.</h1>
            <p>{error}</p>
            <p>
              Your published blog is still available. Your editor stays here
              while you reconnect.
            </p>
            <button
              className="button primary"
              onClick={() =>
                void refreshSession().catch((e) => setError(e.message))
              }
            >
              Try again
            </button>
            <a href={sitePath("/")}>View your blog</a>
          </div>
        </div>
      )}
      <div inert={Boolean(error)} style={{ display: "contents" }}>
        <Admin
          cloudManaged={Boolean(session.cloudManaged)}
          storageConfigured={session.storageConfigured}
          offline={offline}
          logout={async () => {
            await api("/logout", json("POST", {}));
            forgetOfflineSession();
            setSession({ ...session, authenticated: false });
          }}
        />
      </div>
    </>
  );
}

function useOfflineWriter(session: ReturnType<typeof useWorkspace>["session"], offline: boolean) {
  useEffect(() => {
    if (session?.authenticated && !offline) void prepareOfflineWriter();
  }, [session?.authenticated, offline]);
}

function recoveryPage(session: ReturnType<typeof useWorkspace>["session"]) {
  const path = unmountPath(location.pathname).replace(/\/+$/, "");
  if (path === "/admin/verify-email") return <VerifyOwnerEmail />;
  if (["/admin/forgot-password", "/admin/reset-password"].includes(path))
    return <PasswordRecovery recoveryUrl={session?.passwordRecoveryUrl} />;
  return null;
}
