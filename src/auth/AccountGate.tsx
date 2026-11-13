import { useTeamIdentity } from "./TeamContext";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AccountRecovery from "./AccountRecovery";
import AccountAuthentication from "./AccountAuthentication";
import { api, json } from "../api";

export type AccountStatus = {
  connected: boolean;
  connectionState?: "disconnected" | "connected" | "rejected" | "unavailable";
  serverTokenConfigured?: boolean;
  pending: boolean;
  registrationAvailable: boolean;
  email: string;
  blogUrl: string;
  authentication?: { url?: string; expiresAt?: string };
};

export default function AccountGate({
  children,
  feature,
  onConnected,
  embedded = false,
  offlineTools,
}: {
  children: ReactNode;
  feature: string;
  onConnected?: () => void;
  embedded?: boolean;
  offlineTools?: ReactNode;
}) {
  const { primaryOwner } = useTeamIdentity();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const inFlight = useRef(false);
  const acceptConnection = useCallback((account: AccountStatus) => {
    setStatus(account);
    if (!account.connected) return;
    window.dispatchEvent(new Event("margin:account-connected"));
    onConnected?.();
  }, [onConnected]);
  const refresh = useCallback(() => {
    void api<AccountStatus>("/account")
      .then((value) => {
        setStatus(value);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("margin:account-connected", refresh);
    return () =>
      window.removeEventListener("margin:account-connected", refresh);
  }, [refresh]);
  async function connect() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const account = await api<AccountStatus>(
        "/account",
        json("POST", { consent: true }),
      );
      acceptConnection(account);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (accountConnected(status)) return children;
  if (!primaryOwner) return <><p>The publication’s primary owner needs to connect Margin services before you can use {feature.toLowerCase()}.</p>{offlineTools}</>;
  if (status?.authentication?.url) return <><AccountAuthentication status={status} onConnected={acceptConnection} restart={connect} busy={busy} error={error} />{offlineTools}</>;
  const problem = connectionProblem(status);
  if (problem) return <><AccountRecovery feature={feature} {...problem} refresh={refresh} embedded={embedded} />{offlineTools}</>;
  return <><AccountGatePanel feature={feature} embedded={embedded} status={status} error={error} busy={busy} dismissed={dismissed} refresh={refresh} connect={connect} resume={() => setDismissed(false)} dismiss={() => setDismissed(true)} />{offlineTools}</>;
}

type GatePanelProps = {
  feature: string;
  embedded: boolean;
  status: AccountStatus | null;
  error: string;
  busy: boolean;
  dismissed: boolean;
  refresh: () => void;
  connect: () => Promise<void>;
  resume: () => void;
  dismiss: () => void;
};

function AccountGatePanel({ feature, embedded, status, error, busy, dismissed, refresh, connect, resume, dismiss }: GatePanelProps) {
  return (
    <section
      className={embedded ? "account-gate-panel account-gate-embedded" : "account-gate-panel settings-card"}
      aria-label={`${feature} account connection`}
    >
      {!embedded && <h2>{feature}</h2>}
      {!status ? (
        <>
          <p role="status">{error || "Checking account connection…"}</p>
          {error && (
            <button type="button" className="button" onClick={refresh}>
              Try again
            </button>
          )}
        </>
      ) : dismissed ? (
        <>
          <p>
            Your blog works without a Margin account. You can connect whenever
            you want to use {feature.toLowerCase()}.
          </p>
          <button
            type="button"
            className="button"
            onClick={resume}
          >
            Connect an account
          </button>
        </>
      ) : embedded && !status.registrationAvailable ? (
        <p className="notice">Account services aren’t configured for this installation yet. Contact your server administrator. You can keep writing and publishing.</p>
      ) : (
        <AccountConnection feature={feature} embedded={embedded} status={status} error={error} busy={busy} connect={connect} dismiss={dismiss} />
      )}
    </section>
  );
}

function AccountConnection({ feature, embedded, status, error, busy, connect, dismiss }: Pick<GatePanelProps, "feature" | "embedded" | "error" | "busy" | "connect" | "dismiss"> & { status: AccountStatus }) {
  return <>
    {embedded ? <p>Connect a Margin account to use {feature.toLowerCase()}. We’ll use <strong>{status.email}</strong>{status.blogUrl && <> and <strong>{status.blogUrl}</strong></>} to connect it. Your password and posts stay here.</p> : <>
      <p>{feature} requires a Margin account. If you continue, we’ll use <strong>{status.email}</strong>{status.blogUrl && <> and <strong>{status.blogUrl}</strong></>} to connect it.</p>
      <p>Your password and posts aren’t sent when we create your account. Creating the account is free; paid features require a separate subscription you choose.</p>
    </>}
    <p>If your email already has a Margin account, we’ll ask you to sign in and approve this publication. Otherwise, we’ll create your account automatically.</p>
    {!status.registrationAvailable && <p className="notice">Account services aren’t configured for this installation yet. Contact your server administrator. You can keep writing and publishing.</p>}
    {error && <p className="error-box" role="alert">{error}</p>}
    <div className="account-actions">
      <button type="button" className="button primary" disabled={!canRegister(status, busy)} onClick={() => void connect()}>{busy ? "Connecting…" : "Create account and continue"}</button>
      <button type="button" className="button" disabled={busy} onClick={dismiss}>Not now</button>
    </div>
  </>;
}

function canRegister(status: AccountStatus | null, busy: boolean) {
  return !busy && status?.registrationAvailable === true;
}

function connectionProblem(status: AccountStatus | null) {
  if (status?.connectionState !== "rejected" && status?.connectionState !== "unavailable") return null;
  return { rejected: status.connectionState === "rejected", serverToken: status.serverTokenConfigured === true };
}

function accountConnected(status: AccountStatus | null) {
  return status?.connected === true;
}
