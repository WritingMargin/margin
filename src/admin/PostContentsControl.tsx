import { contentTypeLabel } from "../../shared/content-types";
import type { Post } from "../../shared/types";
import Select from "../components/Select";

export default function PostContentsControl({ post, change }: { post: Post; change: (patch: Partial<Post>) => void }) {
  const label = contentTypeLabel(post.contentType);
  const placement = post.tableOfContents ?? "off";
  return <fieldset className="post-contents-control">
    <legend>{label} navigation</legend>
    <label className="featured-post-control">
      <input type="checkbox" checked={placement !== "off"} onChange={event => change({ tableOfContents: event.target.checked ? "top" : "off" })} />
      <span>Table of contents<small>Automatically link to the headings in this {label.toLowerCase()}.</small></span>
    </label>
    {placement !== "off" && <label>Contents placement
      <Select value={placement} onChange={event => change({ tableOfContents: event.target.value as Post["tableOfContents"] })}>
        <option value="top">Above the {label.toLowerCase()}</option><option value="left">Left sidebar</option><option value="right">Right sidebar</option>
      </Select>
      <small>Sidebars move above the content on narrow screens. Add headings to show the contents.</small>
    </label>}
  </fieldset>;
}
