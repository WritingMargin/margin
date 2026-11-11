import type { HomepagePage } from "../../shared/homepage";
import { homepageQuery } from "../../shared/homepage";
import { sitePath } from "../base-path";
import type { Comment, Post } from "../../shared/types";
import type { PublicTheme } from "../../shared/frontend";

async function publicJSON<T>(request: Request, path: string): Promise<T> {
  const response = await fetch(
    new URL(sitePath(`/api/public${path}`), request.url),
    {
      credentials: "same-origin",
      signal: request.signal,
    },
  );
  if (!response.ok)
    throw new Response("Public content unavailable", {
      status: response.status,
    });
  return response.json() as Promise<T>;
}

export async function loadHome(request: Request) {
  const [theme, homepage] = await Promise.all([
    publicJSON<PublicTheme>(request, "/settings"),
    publicJSON<HomepagePage>(
      request,
      "/homepage" + new URL(request.url).search,
    ),
  ]);
  const query = homepageQuery(homepage.page, homepage.query, homepage.selectedTags ?? homepage.tag);
  return {
    theme,
    homepage,
    canonical: `${theme.publicUrl}/${query ? `?${query}` : ""}`,
  };
}

export async function loadArticle(request: Request, slug: string, simplified = false) {
  const [theme, original, availability] = await Promise.all([
    publicJSON<PublicTheme>(request, "/settings"),
    publicJSON<Post>(request, `/posts/${encodeURIComponent(slug)}`),
    publicJSON<{ available: boolean }>(request, `/posts/${encodeURIComponent(slug)}/simplified/availability`).catch(() => ({ available: false })),
  ]);
  const post = simplified
    ? { ...original, ...await publicJSON<Post>(request, `/posts/${encodeURIComponent(slug)}/simplified`), simplifiedAvailable: true }
    : { ...original, simplifiedAvailable: availability.available };
  const comments = await publicJSON<Comment[]>(
    request,
    `/posts/${encodeURIComponent(post.id)}/comments`,
  );
  return {
    theme,
    post,
    comments,
    relatedPosts: post.relatedPosts,
    canonical: `${theme.publicUrl}/post/${encodeURIComponent(post.slug)}`,
  };
}

export async function loadNewsletter(
  request: Request,
  action: string | undefined,
) {
  if (action !== "confirm" && action !== "unsubscribe")
    throw new Response("Not found", { status: 404 });
  const newsletterAction: "confirm" | "unsubscribe" = action;
  return {
    theme: await publicJSON<PublicTheme>(request, "/settings"),
    newsletterAction,
  };
}
