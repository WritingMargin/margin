import { useEffect, useState } from "react";
import { api } from "../api";
import { RefreshCw } from "lucide-react";
import "./StorageQuota.css";

type Usage = { usedBytes: number; quotaBytes: number | null; remainingBytes: number | null; managed: boolean };
export function storageBytes(value: number) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = value > 0 ? Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1) : 0;
  return `${(value / 1024 ** index).toLocaleString("en-GB", { maximumFractionDigits: index ? 2 : 0 })} ${units[index]}`;
}
export default function StorageQuota() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true);
    setError("");
    try { setUsage(await api<Usage>("/storage/usage")); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  return <section aria-label="Storage usage" className="storage-quota">
    <div className="storage-quota-heading"><h3>Storage usage</h3>
      <button type="button" className="button storage-quota-refresh" aria-label={loading ? "Measuring storage usage" : "Refresh storage usage"} disabled={loading} onClick={() => void refresh()}>
        <RefreshCw size={13} className={loading ? "spin" : undefined} aria-hidden="true" />
        {loading ? "Measuring…" : "Refresh"}
      </button>
    </div>
    {usage && <UsageDetails usage={usage} />}
    {!usage && loading && <p className="small-text" role="status">Measuring stored content and files…</p>}
    {error && <div className="error-box" role="alert">{error}</div>}
  </section>;
}
function UsageDetails({ usage }: { usage: Usage }) {
  const { usedBytes, quotaBytes, remainingBytes } = usage;
  if (quotaBytes === null) return <><div className="config-row"><span>Used storage</span><strong>{storageBytes(usedBytes)}</strong></div><div className="config-row"><span>Storage allowance</span><strong>No Margin quota</strong></div><p className="small-text">Your storage provider determines capacity. Margin does not limit your own bucket.</p></>;
  return <>
    <div className="config-row"><span>Used storage</span><strong>{storageBytes(usedBytes)} of {storageBytes(quotaBytes)}</strong></div>
    <progress aria-label="Managed storage used" value={Math.min(usedBytes, quotaBytes)} max={quotaBytes} />
    <div className="config-row"><span>Remaining storage</span><strong>{storageBytes(remainingBytes ?? 0)} left</strong></div>
    {usedBytes >= quotaBytes && <div className="error-box" role="status">Storage is full. Remove content or increase your managed storage allowance.</div>}
    <p className="small-text">Includes stored content, revisions and files in this bucket.</p>
  </>;
}
