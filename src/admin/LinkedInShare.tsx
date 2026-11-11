import { useState } from "react";
import { api, json } from "../api";

type Review = {
  profile: string;
  title: string;
  url: string;
  text: string;
  review: string;
};
export default function LinkedInShare({ id }: { id: string }) {
  const [text, setText] = useState("");
  const [review, setReview] = useState<Review>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit() {
    setBusy(true);
    setNotice("");
    try {
      if (review) {
        await api(
          "/settings/publishing/linkedin/publish",
          json("POST", { id, text, review: review.review }),
        );
        setReview(undefined);
        setText("");
        setNotice("Published to LinkedIn.");
      } else {
        setReview(
          await api<Review>(
            "/settings/publishing/linkedin/preview",
            json("POST", { id, text }),
          ),
        );
      }
    } catch (reason) {
      setReview(undefined);
      setNotice((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy}>
      <legend>Share on LinkedIn</legend>
      <label>
        Message
        <textarea
          value={text}
          maxLength={3000}
          onChange={(e) => {
            setText(e.target.value);
            setReview(undefined);
            setNotice("");
          }}
        />
      </label>
      {review && (
        <div aria-label="LinkedIn post preview">
          <p>
            Public post by <strong>{review.profile}</strong>
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{review.text}</p>
          <p>
            <strong>{review.title}</strong>
            <br />
            {review.url}
          </p>
        </div>
      )}
      <button
        className="button"
        type="button"
        disabled={!text.trim()}
        onClick={submit}
      >
        {review ? "Publish publicly on LinkedIn" : "Review LinkedIn post"}
      </button>
      {notice && <p role="status">{notice}</p>}
    </fieldset>
  );
}
