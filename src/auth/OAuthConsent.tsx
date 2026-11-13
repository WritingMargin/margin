import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Plug } from "lucide-react";
import BrandMark from "../BrandMark";
import PageHeading from "../components/PageHeading";
import { sitePath } from "../base-path";
import { ConsentSignInRequired, consentSignInUrl, loadOAuthConsent, selectConsentPermission, type OAuthConsentData } from "./oauth-consent";
import "./oauth-consent.css";

export default function OAuthConsent() {
  const [data, setData] = useState<OAuthConsentData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void loadOAuthConsent(location.search, controller.signal).then(setData).catch(cause => {
      if (controller.signal.aborted) return;
      if (cause instanceof ConsentSignInRequired) location.replace(consentSignInUrl(location.search));
      else setError(cause.message);
    });
    return () => controller.abort();
  }, [attempt]);
  return <main className="main-workspace">
    <header className="topbar">
      <a className="brand" href={sitePath("/admin")} aria-label="Margin workspace"><BrandMark />margin<span className="brand-period">®</span></a>
    </header>
    <section className="page-content oauth-consent-page">
      <PageHeading label="CONNECT AN APP" title={data ? `What can ${data.client.name} do?` : "Review app permissions"} description="Choose what this app can access in this publication." />
      {data ? <OAuthConsentForm data={data} /> : <section className="settings-card">
        {error ? <div className="error-box" role="alert">{error}<div className="settings-actions"><button className="button" onClick={() => setAttempt(value => value + 1)}>Try again</button><a className="button" href={sitePath("/admin")}>Back to workspace</a></div></div> : <p role="status"><Loader2 className="spin" size={16} /> Loading connection request…</p>}
      </section>}
    </section>
  </main>;
}

export function OAuthConsentForm({ data }: { data: OAuthConsentData }) {
  const [selected, setSelected] = useState(() => data.permissions.map(permission => permission.scope));
  const [busy, setBusy] = useState("");
  const submitted = useRef(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
    if (submitted.current || (decision !== "deny" && selected.length === 0)) { event.preventDefault(); return; }
    submitted.current = true;
    setBusy(decision === "deny" ? "deny" : "allow");
    // Keep successful form controls enabled: native submission must include the
    // clicked decision, selected scopes and the server's signed hidden fields.
  }
  return <form className="settings-card" action={data.action} method="post" onSubmit={submit} aria-busy={Boolean(busy)}>
    {Object.entries(data.fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <div className="settings-icon" aria-hidden="true"><Plug /></div>
    <h2>Connect {data.client.name}</h2>
    <p>Continue only if you started this connection and trust this app.</p>
    <div className="settings-current-address">
      {data.member.email && <span>Signed in as <strong>{data.member.email}</strong></span>}
      <span>Publication resource <code>{data.resource}</code></span>
      <span>Return address <code>{data.redirectUri}</code></span>
    </div>
    <div className="publication-settings-grid">
      <fieldset className="oauth-consent-permissions">
        <legend>Choose permissions</legend>
        <p className="small-text">Only selected permissions will be granted. Uncheck anything this app doesn’t need.</p>
        {data.permissions.map(permission => <label key={permission.scope} className="settings-check">
          <input type="checkbox" name="permission" value={permission.scope} checked={selected.includes(permission.scope)} onChange={event => setSelected(current => selectConsentPermission(current, permission.scope, event.target.checked))} />
          <span><strong>{permission.name}</strong><small className="small-text">{permission.description}</small></span>
        </label>)}
      </fieldset>
    </div>
    <p>Your current publication access applies to every request. Primary-owner account and billing restrictions remain in place. This app cannot create API tokens or manage OAuth connections. You can revoke access in Connected apps.</p>
    <ConsentActions selectedCount={selected.length} busy={busy} />
  </form>;
}
export function ConsentActions({ selectedCount, busy }: { selectedCount: number; busy: string }) {
  return <div className="settings-actions">
    <button className="button" type="submit" name="decision" value="deny" aria-disabled={Boolean(busy)}>{busy === "deny" ? "Cancelling…" : "Cancel"}</button>
    <button className="button primary" type="submit" name="decision" value="allow" disabled={!selectedCount} aria-disabled={Boolean(busy) || !selectedCount}>
      {busy === "allow" && <Loader2 className="spin" size={14} />}{busy === "allow" ? "Allowing…" : "Allow selected permissions"}
    </button>
  </div>;
}
