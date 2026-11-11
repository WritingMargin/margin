import Select from "../components/Select";
import type { NewsletterSettingsController } from "./useNewsletterSettings";
type Props = {
  state: Pick<
    NewsletterSettingsController,
    "config" | "update" | "busy" | "dirty" | "testSMTP"
  >;
};
export default function SMTPOptions({ state }: Props) {
  const { config, update, busy, dirty, testSMTP } = state;
  if (!config) return null;
  const smtp = config.smtp;
  const change = (value: Partial<typeof smtp>) =>
    update({ smtp: { ...smtp, ...value } });
  return (
    <div className="newsletter-options">
      <p className="small-text">
        Send directly through your mail server. No Margin account or paid plan
        is needed.
      </p>
      <label>
        Sender email
        <input
          type="email"
          required
          value={config.senderEmail}
          disabled={busy}
          placeholder="newsletter@yourdomain.com"
          onChange={(e) => update({ senderEmail: e.target.value })}
        />
      </label>
      <div className="newsletter-smtp-grid">
        <label>
          SMTP hostname
          <input
            required
            value={smtp.host}
            disabled={busy}
            placeholder="smtp.example.com"
            onChange={(e) => change({ host: e.target.value })}
          />
        </label>
        <label>
          Port
          <input
            type="number"
            min={1}
            max={65535}
            required
            value={smtp.port}
            disabled={busy}
            onChange={(e) => change({ port: Number(e.target.value) })}
          />
        </label>
      </div>
      <label>
        Connection security
        <Select
          value={smtp.security}
          disabled={busy}
          onChange={(e) =>
            change({ security: e.target.value as "starttls" | "tls" })
          }
        >
          <option value="starttls">STARTTLS (usually port 587)</option>
          <option value="tls">TLS (usually port 465)</option>
        </Select>
      </label>
      <label>
        Username
        <input
          value={smtp.username}
          disabled={busy}
          autoComplete="off"
          onChange={(e) => change({ username: e.target.value })}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={smtp.password ?? ""}
          disabled={busy}
          autoComplete="new-password"
          placeholder={
            smtp.passwordConfigured
              ? "Saved securely — enter to replace"
              : "SMTP password"
          }
          onChange={(e) => change({ password: e.target.value })}
        />
      </label>
      <p className="small-text">
        Credentials are encrypted on this server. Authorize your sender domain
        with your mail provider. Save before testing the connection.
      </p>
      <div>
        <button
          type="button"
          className="button"
          disabled={busy || dirty || !smtp.host}
          onClick={() => void testSMTP()}
        >
          Test connection
        </button>
      </div>
    </div>
  );
}
