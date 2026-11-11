import type { SenderDomain } from "../../shared/newsletter";
export default function SenderDomainSettings({
  email,
  domain,
  busy,
  verify,
}: {
  email: string;
  domain: SenderDomain | null;
  busy: boolean;
  verify: (check: boolean) => Promise<void>;
}) {
  return (
    <div className="newsletter-domain">
      <p className="small-text">
        Verify your domain before sending from this address. Add the DNS records
        to your domain’s DNS settings.
      </p>
      <button
        type="button"
        className="button"
        disabled={busy || !email.includes("@")}
        onClick={() => void verify(!!domain)}
      >
        {domain ? "Check verification" : "Set up domain"}
      </button>
      {domain && (
        <>
          <p role="status">
            {domain.name}:{" "}
            {domain.status === "verified"
              ? "Verified"
              : "Awaiting verification"}
          </p>
          <dl className="newsletter-dns">
            {domain.records.map((record, i) => (
              <div key={`${record.type}-${record.name}-${i}`}>
                <dt>
                  {record.type}
                  {record.priority !== undefined
                    ? ` · Priority ${record.priority}`
                    : ""}{" "}
                  · {record.name}
                </dt>
                <dd>{record.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}
