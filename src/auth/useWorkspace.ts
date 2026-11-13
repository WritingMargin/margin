import type { TeamRole, TeamUser } from "../../shared/team";
import { sitePath, unmountPath } from "../base-path";
import { useEffect, useState } from "react";
import { isAuthEntry } from "../../shared/auth-routes";
import { adminEntryDestination } from "../admin-route";
import { api } from "../api";
import type { OwnerEmailStatus } from "../../shared/owner-email";
import { offlineSessionAfterNetworkError, rememberOfflineSession, forgetOfflineSession as clearOfflineSession } from "./offline-session";
export function useWorkspace() {
  const offlineKey = `margin:offline-session:${sitePath("/admin")}`;
  const [session, setSession] = useState<{
    authenticated: boolean;
    user?: TeamUser;
    role?: TeamRole;
    primaryOwner?: boolean;
    articleIds?: string[];
    centralOrigin?: string;
    setupRequired: boolean;
    storageConfigured: boolean;
    cloudManaged?: boolean;
    teamConnected?: boolean;
    teamPasswordRecoveryUrl?: string;
    passwordRecoveryUrl?: string;
    ownerEmail?: OwnerEmailStatus | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const refreshSession = () =>
    api("/session").then((value) => {
      setSession(value);
      setOffline(false);
      setError("");
      try { rememberOfflineSession(localStorage, offlineKey, value); }
      catch { /* Browser storage is optional. */ }
    }).catch((cause) => {
      const saved = offlineSessionAfterNetworkError(localStorage, offlineKey, cause);
      if (saved) {
        setSession(saved);
        setOffline(true);
        setError("");
        return;
      }
      throw cause;
    });
  useEffect(() => {
    const path = unmountPath(location.pathname).replace(/\/+$/, "");
    if (isAuthEntry(path) || (path === "/admin" && new URLSearchParams(location.search).has("next")))
      {
        const destination = adminEntryDestination(location.search);
        if (!unmountPath(destination).startsWith("/review/")) history.replaceState(null, "", destination);
      }
    refreshSession().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!session?.setupRequired) return;
    const refresh = () => {
      void refreshSession().catch((e) => setError(e.message));
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [session?.setupRequired]);
  useEffect(() => {
    const check = () => {
      void refreshSession().catch((e) => setError(e.message));
    };
    const timer = window.setInterval(check, 30000);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, []);

  function forgetOfflineSession() {
    try { clearOfflineSession(localStorage, offlineKey); } catch { /* Browser storage is optional. */ }
  }
  return { session, setSession, error, setError, refreshSession, offline, forgetOfflineSession };
}
