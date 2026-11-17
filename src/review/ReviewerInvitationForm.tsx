import { useId } from "react";
import { Mail } from "lucide-react";

type Props = {
  email: string;
  setEmail: (email: string) => void;
  busy: boolean;
  archived: boolean;
  status: { notice: string; error: string };
  invite: () => void;
};

export default function ReviewerInvitationForm({
  email,
  setEmail,
  busy,
  archived,
  status,
  invite,
}: Props) {
  const id = useId();
  return (
    <form
      className="peer-invite-form credit-form"
      aria-label="Invite a reviewer"
      onSubmit={(event) => {
        event.preventDefault();
        invite();
      }}
    >
        <p className="credit-dialog-description" id={id + "-help"}>
          Share this article privately for feedback.
        </p>
      <label>
        Email address
        <input
          type="email"
          name="email"
          required
          maxLength={254}
          autoComplete="email"
          placeholder="reviewer@example.com"
          aria-describedby={id + "-help"}
          value={email}
          disabled={busy || archived}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <button className="button primary" disabled={busy || archived}>
        <Mail size={14} />
        {busy ? "Working…" : "Send invitation"}
      </button>
      {archived && (
        <p className="muted">Restore this article to invite a reviewer.</p>
      )}
      {status.notice && (
        <p className="notice" role="status">
          {status.notice}
        </p>
      )}
      {status.error && (
        <p className="error-box" role="alert">
          {status.error}
        </p>
      )}
    </form>
  );
}
