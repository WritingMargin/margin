import { homepageStructuredData, robotsDirective } from "../../shared/seo";
import { publicationCopy } from "../../shared/publication";
import { sitePath, mediaPath } from "../base-path";
import type { MetaDescriptor } from "react-router";
import type { Post } from "../../shared/types";
import { postMetadata } from "../../shared/post-seo";
import type { PublicTheme } from "../../shared/frontend";

export function publicMeta(
  theme: PublicTheme,
  canonical: string,
  post?: Post,
): MetaDescriptor[] {
  const metadata = post
    ? postMetadata(post, theme.name, theme.seo.image)
    : {
        title: theme.seo.title || `${theme.name} — ${publicationCopy(theme.publicationType).navigation}`,
        description: theme.seo.description || theme.description,
        image: theme.seo.image,
      };
  const { title, description } = metadata;
  const image = metadata.image ? new URL(mediaPath(metadata.image), canonical).href : "";
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonical },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    { property: "og:site_name", content: theme.name },
    { property: "og:type", content: post ? "article" : "website" },
    {
      name: "twitter:card",
      content: image ? "summary_large_image" : "summary",
    },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    ...siteMeta(theme, image, post),
    ...(!post ? [{ "script:ld+json": homepageStructuredData(theme.name, title, description, canonical, image) }] : []),
    ...postMeta(post, canonical, image, description, contentSchemaType(theme, post), theme.authorProfile),
  ];
}
function siteMeta(theme: PublicTheme, image: string, post?: Post): MetaDescriptor[] {
  const robots = robotsDirective(theme.seo.indexing, post?.seo);
  return [
    ...(image
      ? [
          { property: "og:image", content: image },
          { name: "twitter:image", content: image },
        ]
      : []),
    ...(robots
      ? [{ name: "robots", content: robots }]
      : []),
    ...(theme.seo.googleVerification
      ? [
          {
            name: "google-site-verification",
            content: theme.seo.googleVerification,
          },
        ]
      : []),
  ];
}
function postMeta(
  post: Post | undefined,
  canonical: string,
  image: string,
  description: string,
  schemaType: string,
  profile?: import("../../shared/author-profile").AuthorProfile,
): MetaDescriptor[] {
  if (!post) return [];
  return [
    {
      tagName: "link",
      rel: "alternate",
      type: "text/markdown",
      href: new URL(sitePath(`/posts/${encodeURIComponent(post.slug)}.md`), canonical)
        .href,
    },
    ...(profile?.name && profile.website ? [{ property: "article:author", content: profile.website }] : []),
    { property: "article:published_time", content: post.createdAt },
    { property: "article:modified_time", content: post.updatedAt },
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": schemaType,
        headline: post.title,
        description,
        url: canonical,
        mainEntityOfPage: canonical,
        datePublished: post.createdAt,
        dateModified: post.updatedAt,
        ...(image ? { image } : {}),
        ...profileStructuredData(profile, canonical),
      },
    },
  ];
}

function contentSchemaType(theme: PublicTheme, post?: Post): string {
  return post?.contentType === "guide" ? "Article" : publicationCopy(theme.publicationType).schemaType;
}

function profileStructuredData(profile: import("../../shared/author-profile").AuthorProfile | undefined, canonical: string) {
  if (!profile?.name) return {};
  return { author: { "@type": "Person", name: profile.name,
    ...(profile.website ? { url: profile.website } : {}),
    ...(profile.image ? { image: new URL(mediaPath(profile.image), canonical).href } : {}),
  } };
}
