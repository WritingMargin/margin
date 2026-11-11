import { useState } from "react";
import { socialPost } from "../../shared/social-posts";
import "./social-post.css";

export default function SocialPostCard({
  url,
  title = "",
}: {
  url: string;
  title?: string;
}) {
  const post = socialPost(url);
  // Changing the source resets consent; permission is per card, not per provider.
  return post ? (
    <PostCard key={post.url} post={post} title={title} />
  ) : (
    <p>Use a valid X, Instagram or LinkedIn post URL.</p>
  );
}
function PostCard({
  post,
  title,
}: {
  post: NonNullable<ReturnType<typeof socialPost>>;
  title: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <section className="social-post-card" aria-label={`${post.provider} post`}>
      <div className="social-post-heading">
        <span className="social-post-badge" aria-hidden="true">
          {post.provider === "LinkedIn"
            ? "in"
            : post.provider === "Instagram"
              ? "◎"
              : "𝕏"}
        </span>
        <span>
          {post.provider}
          <small>Referenced post</small>
        </span>
      </div>
      <a
        className="social-post-title"
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {title || `View this post on ${post.provider}`}{" "}
        <span aria-hidden="true">↗</span>
      </a>
      <div className="social-post-actions">
        <button
          type="button"
          onClick={() => setLoaded(!loaded)}
          aria-expanded={loaded}
        >
          {loaded ? "Hide embed" : "Load embed"}
        </button>
        <span>
          {loaded
            ? "Post unavailable? Open the original above."
            : `Loads content from ${post.provider} only when clicked.`}
        </span>
      </div>
      {loaded && (
        <iframe
          src={post.embedUrl}
          title={`${post.provider} embedded post`}
          className="social-post-embed"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      )}
    </section>
  );
}
