import {
  ArrowRight,
  Check,
  ChevronLeft,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { sitePath } from "../base-path";
import { api, json } from "../api";
import "../newsletter.css";

type Action = "confirm" | "unsubscribe";

function subscriptionCopy(action: Action, complete: boolean, valid: boolean) {
  if (complete)
    return action === "confirm"
      ? {
          headline: "You’re on the list.",
          intro:
            "A little more to look forward to. Your place in the journal is saved.",
          title: "Subscription confirmed",
          step: "ALL SET",
        }
      : {
          headline: "You’re all set.",
          intro:
            "Thanks for spending a little time with us. You’re always welcome back.",
          title: "You’re unsubscribed",
          step: "ALL SET",
        };
  if (!valid)
    return {
      headline: "Let’s find your link.",
      intro:
        "Your inbox holds the invitation. Open the complete link from your email to continue.",
      title: "A link is missing",
      step: "YOUR NEWSLETTER",
    };
  return action === "confirm"
    ? {
        headline: "Your next read starts here.",
        intro:
          "Thoughtful stories. Fresh perspectives. A little space for ideas worth keeping.",
        title: "Make it official.",
        step: "ONE LAST STEP",
      }
    : {
        headline: "Your inbox. Your choice.",
        intro:
          "Taking a little space? You can leave the newsletter with one click.",
        title: "Leave the newsletter?",
        step: "MANAGE SUBSCRIPTION",
      };
}

export function NewsletterSubscription({
  action,
  publicationName = "the journal",
}: {
  action: Action;
  publicationName?: string;
}) {
  const [token, setToken] = useState("");
  useEffect(() => setToken(location.hash.slice(1)), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const valid = /^[a-f0-9]{64}$/.test(token);
  const copy = subscriptionCopy(action, Boolean(message), valid);
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>(
        `/public/newsletter/${action}`,
        json("POST", { token }),
      );
      setMessage(result.message);
      history.replaceState(null, "", location.pathname);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="newsletter-confirmation-page">
      <div className="newsletter-confirmation-story">
        <span className="newsletter-kicker">
          <span className="newsletter-live-dot" /> {copy.step}
        </span>
        <h1>{copy.headline}</h1>
        <p>{copy.intro}</p>
        <span className="newsletter-publication-tag">
          <Mail size={15} aria-hidden="true" /> Letters from {publicationName}
        </span>
      </div>
      <section
        className="newsletter-confirmation-card"
        aria-labelledby="newsletter-action-title"
      >
        <div
          className={`newsletter-confirmation-icon ${message ? "is-complete" : ""}`}
        >
          {message ? (
            <Check size={28} strokeWidth={1.7} aria-hidden="true" />
          ) : (
            <Mail size={28} strokeWidth={1.5} aria-hidden="true" />
          )}
        </div>
        <h2 id="newsletter-action-title">{copy.title}</h2>
        <SubscriptionAction
          action={action}
          valid={valid}
          busy={busy}
          message={message}
          submit={submit}
        />
        {error && (
          <p role="alert" className="newsletter-inline-error">
            {error}
          </p>
        )}
        <div className="newsletter-confirmation-footer">
          <ShieldCheck size={15} aria-hidden="true" /> Your inbox stays in your
          control.
        </div>
      </section>
      <a className="newsletter-return-link" href={sitePath("/")}>
        <ChevronLeft size={15} aria-hidden="true" /> Back to the journal
      </a>
    </main>
  );
}

function SubscriptionAction({
  action,
  valid,
  busy,
  message,
  submit,
}: {
  action: Action;
  valid: boolean;
  busy: boolean;
  message: string;
  submit: () => Promise<void>;
}) {
  if (message)
    return (
      <>
        <p role="status" className="newsletter-confirmation-message">
          {message}
        </p>
        <a className="newsletter-primary-button" href={sitePath("/")}>
          Explore the journal
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </>
    );
  if (!valid)
    return (
      <p className="newsletter-confirmation-message">
        This link is incomplete. Please open the full link from your email.
      </p>
    );
  return (
    <>
      <p className="newsletter-confirmation-message">
        {action === "confirm"
          ? "Confirm your email to subscribe or sign back in. Your personal link works once and expires in 24 hours."
          : "Confirm below to stop receiving this publication’s newsletter."}
      </p>
      <button
        className="newsletter-primary-button"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy
          ? "Saving…"
          : action === "confirm"
            ? "Confirm email"
            : "Unsubscribe"}
        <ArrowRight size={17} aria-hidden="true" />
      </button>
      <p className="newsletter-confirmation-hint">
        {action === "confirm"
          ? "Didn’t request this? You can safely close this page."
          : "You can subscribe again whenever you like."}
      </p>
    </>
  );
}
