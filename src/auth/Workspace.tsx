import { signedInEntry } from "./workspace-entry";
import { adminEntryDestination } from "../admin-route";
import AcceptInvitation from "../team/AcceptInvitation";
import ReviewerHome from "../team/ReviewerHome";
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

type WorkspaceState = ReturnType<typeof useWorkspace>;
type ActiveSession = NonNullable<WorkspaceState["session"]>;
export default function Workspace() {
  const state = useWorkspace();
  const { session, setSession, refreshSession, offline, forgetOfflineSession } = state;
  useOfflineWriter(session, offline);
  useReviewReturn(session);
  const recovery = recoveryPage(session);
  const logout = async () => {
    await api("/logout", json("POST", {}));
    forgetOfflineSession();
    if (session) setSession({ ...session, authenticated: false });
  };
  if (recovery) return recovery;
  if (!session) return <WorkspaceLoading error={state.error} />;
  if (!session.authenticated) return <Login key={session.setupRequired ? "setup" : "login"} setup={session.setupRequired} cloudManaged={session.cloudManaged} onLogin={refreshSession} />;
  return <SignedInWorkspace session={session} state={state} logout={logout} />;
}

function SignedInWorkspace({ session, state, logout }: { session: ActiveSession; state: WorkspaceState; logout: () => Promise<void> }) {
  const entry = signedInEntry(location.search, session.role);
  if (entry.kind === "oauth") return <OAuthReturn query={entry.query} />;
  if (entry.kind === "reviews") return <ReviewerHome user={session.user} logout={logout} />;
  if (entry.kind === "cli") return session.primaryOwner === false ? <p>Only the primary owner can connect the CLI.</p> : <CLIConnect code={entry.code} />;
  return <>
    <WorkspaceError state={state} />
    <div inert={Boolean(state.error)} style={{ display: "contents" }}>
      <Admin key={`${session.user?.id || "local-owner"}:${session.role || "owner"}`} primaryOwner={session.primaryOwner} user={session.user} articleIds={session.articleIds} role={session.role || "owner"} cloudManaged={Boolean(session.cloudManaged)} storageConfigured={session.storageConfigured} offline={state.offline} logout={logout} />
    </div>
  </>;
}
function WorkspaceLoading({ error }: { error: string }) {
  return <div className="loading-screen"><BrandMark /><p>{error || "Opening your workspace…"}</p>{error && <button onClick={() => location.reload()}>Try again</button>}</div>;
}
function WorkspaceError({ state }: { state: WorkspaceState }) {
  if (!state.error) return null;
  return <div className="workspace-unavailable" role="alert"><div><BrandMark /><h1>Let’s reconnect your workspace.</h1><p>{state.error}</p><p>Your published blog is still available. Your editor stays here while you reconnect.</p><button className="button primary" onClick={() => void state.refreshSession().catch(error => state.setError(error.message))}>Try again</button><a href={sitePath("/")}>View your blog</a></div></div>;
}
function useReviewReturn(session: WorkspaceState["session"]) {
  const destination = adminEntryDestination(location.search);
  useEffect(() => {
    if (!session?.authenticated || new URLSearchParams(location.search).get("oauthAuthorize")) return;
    if (destination && /^\/review\/[a-zA-Z0-9_-]+$/.test(unmountPath(destination))) {
      location.replace(destination);
    }
  }, [session?.authenticated, destination]);
}
function useOfflineWriter(session: WorkspaceState["session"], offline: boolean) {
  useEffect(() => {
    if (session?.authenticated && session.role !== "peer_reviewer" && !offline) void prepareOfflineWriter();
  }, [session?.authenticated, session?.role, offline]);
}
function recoveryPage(session: WorkspaceState["session"]) {
  const path = unmountPath(location.pathname).replace(/\/+$/, "");
  if (path === "/admin/invite") return <AcceptInvitation />;
  if (path === "/admin/verify-email") return <VerifyOwnerEmail />;
  if (["/admin/forgot-password", "/admin/reset-password"].includes(path)) return <PasswordRecovery hostedOwnerRecoveryUrl={session?.hostedOwnerRecoveryUrl} />;
  return null;
}
