import { useEffect, useState } from "react";
import { api, json } from "../api";
import { sitePath } from "../base-path";
import "../newsletter.css";
export default function ReaderSignIn() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setToken(location.hash.slice(1));
  }, []);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ returnTo: string }>(
        "/public/comment-auth/confirm",
        json("POST", { token }),
      );
      history.replaceState(null, "", location.pathname);
      location.assign(result.returnTo);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="newsletter-signup newsletter-manage">
      <h1>Sign in to Margin</h1>
      <p>
        Continue only if you requested this sign-in link in this browser. This
        won’t subscribe you to the newsletter.
      </p>
      {/^[a-f0-9]{64}$/.test(token) ? (
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      ) : (
        <p>Open the complete link from your sign-in email.</p>
      )}
      {error && <p role="alert">{error}</p>}
      <a className="back-link" href={sitePath("/")}>
        Back to the blog
      </a>
    </main>
  );
}
