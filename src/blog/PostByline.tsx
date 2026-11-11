import type { AuthorProfile } from "../../shared/author-profile";
import { safeMediaUrl } from "../media";

export default function PostByline({ byline }: { byline?: AuthorProfile | null }) {
  if (!byline?.name.trim()) return null;
  const image = safeMediaUrl(byline.image);
  return <div className="post-byline">
    {image && <img src={image} alt="" width={32} height={32} />}
    <span>By {byline.website ? <a rel="author" href={byline.website}>{byline.name}</a> : byline.name}</span>
  </div>;
}
