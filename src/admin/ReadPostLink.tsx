import { Eye } from "lucide-react";
import type { Post } from "../../shared/types";
import { sitePath } from "../base-path";

export default function ReadPostLink({ post }: { post: Post }) {
  if (post.status !== "published") return null;
  return (
    <a className="post-read-link" href={sitePath(`/post/${encodeURIComponent(post.slug)}`)} target="_blank" rel="noopener noreferrer" aria-label={`Read ${post.title} (opens in a new tab)`}>
      <Eye size={15} aria-hidden="true" /> Read
    </a>
  );
}
