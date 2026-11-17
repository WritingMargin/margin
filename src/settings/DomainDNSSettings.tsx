import CopyField from "../components/CopyField";
import { cnameRecord, publicDNSName } from "./domain-dns";
import "./domain-setup.css";

export default function DomainDNSSettings({ publicUrl, targetUrl }: { publicUrl: string; targetUrl: string }) {
  const target = publicDNSName(targetUrl) || "";
  const host = publicDNSName(publicUrl);
  if (host && host === target) return <section className="domain-dns-settings" aria-label="DNS record">
    <p>Enter a custom domain above to see its DNS record.</p>
  </section>;
  const record = cnameRecord(publicUrl, target);
  const invalidRecord = Boolean(host && target);
  return <section className="domain-dns-settings" aria-label="DNS record">
    <p>Add this record at your DNS provider.</p>
    {!target && <p className="small-text" role="status">Your assigned hosting hostname is unavailable. Try again when hosting setup is ready.</p>}
    <div className="domain-dns-table-wrap" role="region" aria-label="DNS record values" tabIndex={0}>
      <table className="domain-dns-table">
        <thead><tr><th scope="col">Type</th><th scope="col">Name</th><th scope="col">Value</th><th scope="col">TTL</th></tr></thead>
        <tbody><DNSRecordRow host={host} target={target} copyTarget={record.target} /></tbody>
      </table>
    </div>
    {target && record.error && <p className={invalidRecord ? "error-box" : "small-text"} role={invalidRecord ? "alert" : undefined}>{record.error}</p>}
    <p className="small-text">For a root domain or an existing website, use Nginx proxy.</p>
  </section>;
}

function DNSRecordRow({ host, target, copyTarget }: { host: string | null; target: string; copyTarget?: string }) {
  return <tr>
    <td>CNAME</td>
    <td><CopyField label="Name" variant="table" value={host || ""} placeholder="Enter your address above" /></td>
    <td><CopyField label="Value" variant="table" value={target} placeholder="Assigned hostname unavailable" copyValue={copyTarget || ""} /></td>
    <td>Auto</td>
  </tr>;
}
