import { useEffect, useState } from "react";
import { api, json } from "../api";

type CountryDatabase = {
  installed: boolean;
  storageConfigured: boolean;
  version: string;
  sourceUrl: string;
  error: string;
};

function useCountryDatabase() {
  const [status, setStatus] = useState<CountryDatabase | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api<CountryDatabase>("/settings/country-database")
      .then((next) => { if (active) setStatus(next); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not check country lookup."); });
    return () => { active = false; };
  }, []);

  const install = async () => {
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<CountryDatabase>("/settings/country-database", json("POST", { confirm: true }));
      setStatus(next);
      setReviewing(false);
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not install the country database.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => { setReviewing(false); setConfirmed(false); };
  return { status, reviewing, setReviewing, confirmed, setConfirmed, busy, error, install, cancel };
}

export default function CountryDatabaseSettings() {
  const { status, reviewing, setReviewing, confirmed, setConfirmed, busy, error, install, cancel } = useCountryDatabase();

  return (
    <section className="settings-card" aria-labelledby="country-database-title">
      <h2 id="country-database-title">Country lookup</h2>
      <CountryDatabaseStatus status={status} error={error} />
      {status && status.storageConfigured && !status.installed && !reviewing && (
        <button className="button" type="button" onClick={() => setReviewing(true)}>
          Review database download
        </button>
      )}
      {status && status.storageConfigured && !status.installed && reviewing && (
        <CountryDatabaseConfirmation sourceUrl={status.sourceUrl} confirmed={confirmed} setConfirmed={setConfirmed} busy={busy} install={install} cancel={cancel} />
      )}
    </section>
  );
}

function CountryDatabaseStatus({ status, error }: { status: CountryDatabase | null; error: string }) {
  return <>
    <p>{status?.installed
      ? `DB-IP Country Lite ${status.version} is installed on this Margin engine. New visits show countries.`
      : status && !status.storageConfigured
        ? "Configure S3 storage before installing country lookup. Visitor IPs are discarded; location stays unknown."
        : "Visitor IPs are discarded until you install a country database. New visits show an unknown location."}</p>
    {status?.error && <p className="error-box" role="alert">{status.error}</p>}
    {error && <p className="error-box" role="alert">{error}</p>}
    {!status && !error && <p role="status">Checking country lookup…</p>}
  </>;
}

type ConfirmationProps = {
  sourceUrl: string;
  confirmed: boolean;
  setConfirmed: (confirmed: boolean) => void;
  busy: boolean;
  install: () => Promise<void>;
  cancel: () => void;
};

function CountryDatabaseConfirmation({ sourceUrl, confirmed, setConfirmed, busy, install, cancel }: ConfirmationProps) {
  return <div className="country-database-confirm">
    <p>
      Margin will download one DB-IP Country Lite file from Eris Networks
      to this engine’s private storage. It will verify the file’s checksum
      and format before using it. No download happens until you confirm.
    </p>
    <p><a href={sourceUrl} target="_blank" rel="noopener noreferrer">View the source and licence at DB-IP</a></p>
    <label>
      <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      I want this Margin engine to download and store the database.
    </label>
    <div className="country-database-actions">
      <button className="button" type="button" disabled={!confirmed || busy} onClick={install}>
        {busy ? "Downloading and verifying…" : "Download and install"}
      </button>
      <button className="button secondary" type="button" disabled={busy} onClick={cancel}>Cancel</button>
    </div>
  </div>;
}
