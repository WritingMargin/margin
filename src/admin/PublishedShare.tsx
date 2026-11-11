import { useEffect, useState } from "react";
import { ArrowUpRight, Copy, Link2 } from "lucide-react";
import { api } from "../api";
import type { Post } from "../../shared/types";
import { devShareLink, socialShareLinks } from "../blog/share";
import "./published-share.css";

export default function PublishedShare({ post }: { post: Post }) {
  const [url, setURL] = useState("");
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<{ publicUrl: string }>("/public/settings", {
      signal: controller.signal,
    })
      .then(({ publicUrl }) =>
        setURL(
          publicUrl.replace(/\/$/, "") +
            "/post/" +
            encodeURIComponent(post.slug),
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage(
            "The article link could not be loaded. Reopen post details to try again.",
          );
      });
    return () => controller.abort();
  }, [post.slug]);
  async function copy(value: string, notice: string) {
    try {
      await navigator.clipboard.writeText(value);
      setManual("");
      setMessage(notice);
    } catch {
      setManual(value);
      setMessage("Select and copy the text below.");
    }
  }
  const caption = [post.title, post.excerpt, url].filter(Boolean).join("\n\n");
  return (
    <section className="published-share" aria-label="Share your article">
      <h3>Share your article</h3>
      {url && (
        <>
          <div className="published-share-link">
            <Link2 size={15} aria-hidden="true" />
            <a href={url} target="_blank" rel="noreferrer">
              {post.slug}
              <ArrowUpRight size={13} />
            </a>
            <button
              type="button"
              onClick={() => void copy(url, "Article link copied.")}
            >
              <Copy size={13} />
              Copy link
            </button>
          </div>
          <nav aria-label="Sharing destinations">
            {socialShareLinks(post.title, url).map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target={label === "Email" ? undefined : "_blank"}
                rel="noreferrer"
              >
                {label}
              </a>
            ))}
            <button
              type="button"
              onClick={() =>
                void copy(caption, "Caption copied for Instagram.")
              }
            >
              Copy Instagram caption
            </button>
            <a
              href="https://medium.com/p/import"
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                void copy(
                  url,
                  "Paste the article link into Medium’s import tool.",
                )
              }
            >
              Import to Medium
            </a>
            <a
              href="https://substack.com/notes"
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                void copy(url, "Paste the article link into a Substack note.")
              }
            >
              Substack
            </a>
            <a
              href={devShareLink(post.title, url)}
              target="_blank"
              rel="noreferrer"
            >
              DEV
            </a>
          </nav>
        </>
      )}
      <div role="status">{message}</div>
      {manual && (
        <textarea
          aria-label="Text to copy"
          readOnly
          value={manual}
          onFocus={(e) => e.target.select()}
        />
      )}
    </section>
  );
}
