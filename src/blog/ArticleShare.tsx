import { useState } from "react";
import { useShareMenu } from "./useShareMenu";
import { ChevronDown, Copy, ExternalLink, Mail, Share2 } from "lucide-react";
import type { Post } from "../../shared/types";
import { sitePath } from "../base-path";
import { devShareLink, shareArticle, socialShareLinks } from "./share";

export default function ArticleShare({
  post,
  publicUrl,
}: {
  post: Post;
  publicUrl?: string;
}) {
  const [message, setMessage] = useState("");
  const [manualURL, setManualURL] = useState("");
  const [url, setURL] = useState(
    publicUrl
      ? `${publicUrl.replace(/\/$/, "")}/post/${encodeURIComponent(post.slug)}`
      : "",
  );
  const { menu, close } = useShareMenu();
  if (post.status !== "published") return null;
  async function share(native: boolean) {
    const result = await shareArticle(post.title, url, {
      share:
        native && navigator.share ? navigator.share.bind(navigator) : undefined,
      clipboard: navigator.clipboard,
    });
    setMessage(result === "copied" ? "Link copied" : "");
    setManualURL(result === "manual" ? url : "");
  }
  async function copyForPlatform(platform: "Medium" | "Substack") {
    const destination =
      platform === "Medium" ? "Medium’s import tool" : "a Substack note";
    const result = await shareArticle(post.title, url, {
      clipboard: navigator.clipboard,
    });
    setMessage(
      result === "copied"
        ? `Link copied. Paste it into ${destination}.`
        : `Copy the article link below and paste it into ${destination}.`,
    );
    setManualURL(result === "manual" ? url : "");
  }
  return (
    <div className="article-share-control">
      <details
        className="article-share"
        ref={menu}
        onToggle={(event) => {
          if (event.currentTarget.open) {
            setMessage("");
            setManualURL("");
          }
          if (event.currentTarget.open && !url)
            setURL(
              new URL(
                sitePath(`/post/${encodeURIComponent(post.slug)}`),
                window.location.origin,
              ).href,
            );
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menu.current?.open) {
            close();
            event.stopPropagation();
          }
        }}
      >
        <summary className="article-share-button" aria-label="Share this article">
          <Share2 size={15} aria-hidden="true" /> <span className="article-action-label">Share</span>{" "}
          <ChevronDown size={12} aria-hidden="true" />
        </summary>
        <div
          className="share-menu"
          onClick={(event) => {
            if ((event.target as Element).closest("a, button")) close();
          }}
        >
          <span className="share-menu-label">SHARE THIS ARTICLE</span>
          <nav aria-label="Share article">
            {url &&
              socialShareLinks(post.title, url).map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target={label === "Email" ? undefined : "_blank"}
                  rel="noopener noreferrer"
                >
                  {label === "Email" ? (
                    <Mail size={15} aria-hidden="true" />
                  ) : (
                    <ExternalLink size={15} aria-hidden="true" />
                  )}
                  {label}
                  <span className="sr-only">
                    {label === "Email"
                      ? " (opens email app)"
                      : " (opens in a new tab)"}
                  </span>
                </a>
              ))}
          </nav>
          {url && (
            <nav
              className="share-menu-actions"
              aria-label="Share to publishing platforms"
            >
              <span className="share-menu-label">ON OTHER PLATFORMS</span>
              <a
                href="https://medium.com/p/import"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void copyForPlatform("Medium")}
              >
                <ExternalLink size={15} aria-hidden="true" />
                <span>
                  Medium<small>Import your article · paste its link</small>
                </span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                href="https://substack.com/notes"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void copyForPlatform("Substack")}
              >
                <ExternalLink size={15} aria-hidden="true" />
                <span>
                  Substack<small>Share a note · paste the article link</small>
                </span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a
                href={devShareLink(post.title, url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={15} aria-hidden="true" />
                <span>
                  DEV Community
                  <small>Start a draft with this article’s link</small>
                </span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </nav>
          )}
          <div className="share-menu-actions">
            <button type="button" onClick={() => void share(false)}>
              <Copy size={15} aria-hidden="true" />
              Copy link
            </button>
            {typeof navigator !== "undefined" &&
              typeof navigator.share === "function" && (
                <button type="button" onClick={() => void share(true)}>
                  <Share2 size={15} aria-hidden="true" />
                  More sharing options
                </button>
              )}
          </div>
        </div>
      </details>
      <div className="share-result">
        <span className="share-feedback" role="status">
          {message}
        </span>
        {manualURL && (
          <label className="share-copy">
            Copy this link
            <input
              aria-label="Article link"
              readOnly
              value={manualURL}
              onFocus={(event) => event.target.select()}
            />
          </label>
        )}
      </div>
    </div>
  );
}
