import { ArrowRight, Check, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { api, json } from "../api";
import "../newsletter.css";

export function NewsletterSignup({
  publicationName = "the journal",
}: {
  publicationName?: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ enabled: boolean }>("/public/newsletter")
      .then((value) => {
        if (active) setEnabled(value.enabled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!enabled) return null;
  return (
    <section
      className="newsletter-signup newsletter-signup-modern"
      aria-labelledby="newsletter-title"
    >
      <div className="newsletter-signup-story">
        <span className="newsletter-kicker">
          <span className="newsletter-live-dot" /> THE NEWSLETTER
        </span>
        <h2 id="newsletter-title">
          Good ideas.
          <br />
          Straight to your inbox.
        </h2>
        <p>
          A little more from {publicationName}. Subscribe for new stories and
          notes, delivered to your inbox.
        </p>
        <span className="newsletter-small-note">
          <Check size={13} aria-hidden="true" /> Confirm by email. Unsubscribe
          anytime.
        </span>
      </div>
      <div className="newsletter-signup-panel">
        <span className="newsletter-icon-tile">
          <Mail size={22} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <h3>{message ? "Check your inbox." : "Your next good read."}</h3>
        {message ? (
          <p role="status" className="newsletter-signup-received">
            {message}
          </p>
        ) : (
          <>
            <p>Join the conversation. Start with your email.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (busy) return;
                const website = new FormData(e.currentTarget).get("website");
                setBusy(true);
                setError("");
                try {
                  const result = await api<{ message: string }>(
                    "/public/newsletter/subscribe",
                    json("POST", { email, website }),
                  );
                  setMessage(result.message);
                  setEmail("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="newsletter-trap" aria-hidden="true">
                Leave this empty
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
              <label>
                Your email
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={busy}
                />
              </label>
              <button className="newsletter-primary-button" disabled={busy}>
                {busy ? "Sending…" : "Subscribe"}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </form>
          </>
        )}
        {error && (
          <p role="alert" className="newsletter-inline-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
