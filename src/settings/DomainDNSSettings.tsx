import { useState } from "react";
import { Copy, Globe2 } from "lucide-react";
import SettingsDisclosure from "./SettingsDisclosure";
import { cnameRecord, publicDNSName } from "./domain-dns";
import "./DeploymentSettings.css";

export default function DomainDNSSettings({
  publicUrl,
}: {
  publicUrl: string;
}) {
  const [target, setTarget] = useState("");
  const [copied, setCopied] = useState<{
    record: string;
    message: string;
  } | null>(null);
  const host = publicDNSName(publicUrl);
  const record = cnameRecord(publicUrl, target);
  async function copy() {
    if (!record.text) return;
    try {
      await navigator.clipboard.writeText(record.text);
      setCopied({ record: record.text, message: "DNS record copied." });
    } catch {
      setCopied({
        record: record.text,
        message: "Select the record below and copy it manually.",
      });
    }
  }
  return (
    <SettingsDisclosure
      className="deployment-settings"
      title="Connect your domain with DNS"
      description="Set up a CNAME for a subdomain, or point your root domain to your server."
      icon={<Globe2 />}
    >
      <p>
        First enter your new public URL above. At the company that manages your
        domain’s DNS, add a record for{" "}
        {host ? <strong>{host}</strong> : "your chosen hostname"}.
      </p>
      <p>
        For a subdomain such as <code>blog.example.com</code>, use a CNAME
        pointing to the hostname supplied by your hosting provider or to your
        own server’s hostname.
      </p>
      <label htmlFor="domain-cname-target">
        CNAME target
        <input
          id="domain-cname-target"
          value={target}
          onChange={(event) => {
            setTarget(event.target.value);
            setCopied(null);
          }}
          placeholder="server.example.net"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={253}
          aria-describedby="domain-cname-help"
        />
      </label>
      <p className="small-text" id="domain-cname-help">
        Use a hostname that already resolves to your server. Your hosting
        provider must also accept your custom domain; pointing DNS at an
        arbitrary hosted address will not connect it.
      </p>
      {!host && (
        <p className="small-text">
          Enter a public HTTPS domain above to prepare the record. Localhost and
          IP addresses cannot be CNAME names.
        </p>
      )}
      {target.trim() && record.error && (
        <p className="error-box" role="alert">
          {record.error}
        </p>
      )}
      {record.text && (
        <div className="deployment-result">
          <p className="small-text">
            Type: <strong>CNAME</strong>. Name / Host:{" "}
            <strong>{record.name}</strong>. Target:{" "}
            <strong>{record.target}</strong>. TTL: your provider’s default.
          </p>
          <p className="small-text">
            Some DNS providers add your domain automatically: enter{" "}
            <code>blog</code> for <code>blog.example.com</code> in that case.
            Replace a conflicting record at this same name.
          </p>
          <pre tabIndex={0} aria-label="CNAME record">
            <code>{record.text}</code>
          </pre>
          <button type="button" className="button" onClick={() => void copy()}>
            <Copy size={14} />
            Copy DNS record
          </button>
          <p className="small-text" role="status">
            {copied?.record === record.text ? copied.message : ""}
          </p>
        </div>
      )}
      <p>
        <strong>Using a root domain?</strong> For an address such as{" "}
        <code>example.com</code>, use an A record for your server’s IPv4
        address, an AAAA record for IPv6, or your DNS provider’s supported ALIAS
        / CNAME flattening option. A standard CNAME cannot be used at the root.
      </p>
      <p>
        <strong>Using an existing website’s /blog path?</strong> DNS points a
        hostname to a server; it cannot route a path or a port. Keep the
        existing website’s DNS and configure Nginx or Apache to forward the blog
        path to Margin.
      </p>
      <p className="deployment-note">
        After DNS updates, configure the domain and an HTTPS certificate on your
        web server or with your hosting provider. Open the new address to check
        it serves this publication, then save it above. These instructions do
        not change your DNS or issue a certificate.
      </p>
    </SettingsDisclosure>
  );
}
