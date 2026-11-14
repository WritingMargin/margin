import { useState } from "react";
import CopyField from "../components/CopyField";
import { cnameRecord, publicDNSName } from "./domain-dns";
import "./DeploymentSettings.css";

export default function DomainDNSSettings({ publicUrl }: { publicUrl: string }) {
  const [target, setTarget] = useState("");
  const host = publicDNSName(publicUrl);
  const record = cnameRecord(publicUrl, target);
  return (
    <section
      className="settings-card settings-guide deployment-settings"
      aria-labelledby="domain-dns-heading"
    >
      <h2 id="domain-dns-heading">DNS record</h2>
      <p>Add these values at your DNS provider.</p>
      <CopyField label="Type" value="CNAME" />
      <CopyField label="Name / Host" value={host || ""} placeholder="Enter your blog’s URL first" />
      <CopyField
        label="Value / Target"
        value={target}
        onChange={setTarget}
        placeholder="Your hosting provider’s hostname"
        copyValue={record.target || ""}
      />
      {target.trim() && record.error && (
        <p className="error-box" role="alert">{record.error}</p>
      )}
      <CopyField label="TTL" value="Auto" />
      <p className="small-text">
        Root domains need A/AAAA or CNAME flattening. For an existing website’s
        /blog path, use Server configuration.
      </p>
    </section>
  );
}
