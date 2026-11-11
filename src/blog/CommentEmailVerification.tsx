import { useEffect, useState } from "react";
import { api, json } from "../api";
import { sitePath } from "../base-path";
import "../newsletter.css";

function clearVerificationReceipt(submissionId: string) {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (
        key.startsWith("margin:comment-verification:") &&
        sessionStorage.getItem(key) === submissionId
      )
        sessionStorage.removeItem(key);
    }
  } catch {
    /* Confirmation does not depend on browser storage. */
  }
}

export default function CommentEmailVerification() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setToken(location.hash.slice(1));
  }, []);
  const valid = /^[a-f0-9]{64}$/.test(token);
  async function verify() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string; submissionId: string }>(
        "/public/comments/verify",
        json("POST", { token }),
      );
      setMessage(result.message);
      clearVerificationReceipt(result.submissionId);
      history.replaceState(null, "", location.pathname);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="newsletter-signup newsletter-manage">
      <h1>Verify your comment</h1>
      {message ? (
        <p role="status">{message}</p>
      ) : (
        <>
          <p>
            {valid
              ? "Confirm your email for this comment or question. This does not sign you in or subscribe you to the newsletter."
              : "Open the complete verification link from your email."}
          </p>
          {valid && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void verify()}
            >
              {busy ? "Verifying…" : "Verify my comment"}
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <a className="back-link" href={sitePath("/")}>
        Back to the blog
      </a>
    </main>
  );
}
