import { coverImage } from "./audio";
import { articleDescription } from "./article-description";
import type { Post } from "./types";

export function postMetadata(
  post: Post,
  blogName: string,
  defaultImage: string,
) {
  return {
    title: post.seo.title || `${post.title} — ${blogName}`,
    description:
      [post.seo.description, post.excerpt].find((value) => value.trim()) ||
      articleDescription(post.content || "", post.title),
    image: post.seo.image || coverImage(post.cover) || defaultImage,
  };
}
