import { mediaPath } from "../base-path";
import type { Post } from "../../shared/types";
import type { PostSEOSettings } from "../../shared/seo";
import { postMetadata } from "../../shared/post-seo";
import { useAuthorProfile } from "../profile/AuthorProfileContext";

type Props = {
  post: Post;
  blogName: string;
  change: (patch: Partial<Post>) => void;
};
export default function PostSEOFields({ post, blogName, change }: Props) {
  const update = (patch: Partial<PostSEOSettings>) =>
    change({ seo: { ...post.seo, ...patch } });
  const preview = postMetadata(post, blogName, "");
  const profile = useAuthorProfile()?.profile;
  return (
    <div className="post-seo-fields">
      <p className="small-text">
        Set how this post appears in search results and shared links. Your
        article’s heading, excerpt, and cover stay the same.
      </p>
      {profile && <p className="small-text">
        {profile.name ? `Public byline: ${profile.name}.` : "The public byline is hidden because the display name is empty."}
        {" "}Manage the shared byline in Profile → Public profile.
      </p>}
      <label>
        Search title <span className="muted">{post.seo.title.length}/120</span>
        <input
          maxLength={120}
          value={post.seo.title}
          placeholder={`${post.title} — ${blogName}`}
          onChange={(event) => update({ title: event.target.value })}
        />
      </label>
      <label>
        Search description{" "}
        <span className="muted">{post.seo.description.length}/320</span>
        <textarea
          rows={3}
          maxLength={320}
          value={post.seo.description}
          placeholder={
            preview.description || "Describe what readers will find in this article."
          }
          onChange={(event) => update({ description: event.target.value })}
        />
      </label>
      <p className="small-text">
        Leave these blank to use the article’s title and excerpt. If the excerpt is also blank, the description uses a short preview of the article text.
      </p>
      <fieldset className="post-indexing-controls">
        <legend>Search indexing</legend>
        <label className="settings-check">
          <input type="checkbox" checked={post.seo.noindex === true}
            onChange={event => update({ noindex: event.target.checked })} />
          <span>Hide this post from search results <code>noindex</code></span>
        </label>
        <label className="settings-check">
          <input type="checkbox" checked={post.seo.nofollow === true}
            onChange={event => update({ nofollow: event.target.checked })} />
          <span>Ask search engines not to follow links <code>nofollow</code></span>
        </label>
        <p className="small-text">These requests apply when the post is published. The post stays public and readable. Turning off blog-wide indexing takes precedence over both settings.</p>
      </fieldset>
      <div className="post-seo-preview">
        <span className="eyebrow">SEARCH PREVIEW</span>
        <h3>{preview.title}</h3>
        <p>{preview.description}</p>
        {preview.image && (
          <img src={mediaPath(preview.image)} alt="Post sharing image preview" />
        )}
      </div>
      <p className="small-text">
        These changes are saved when you save or publish the post.
      </p>
    </div>
  );
}
