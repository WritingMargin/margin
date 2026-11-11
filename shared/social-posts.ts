export type SocialPost = {
  provider: "X" | "Instagram" | "LinkedIn";
  url: string;
  embedUrl: string;
};

// Never fetch arbitrary URLs or accept author-supplied iframe HTML.
export function socialPost(value: string): SocialPost | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const host = url.hostname.toLowerCase();
  if (
    [
      "x.com",
      "www.x.com",
      "twitter.com",
      "www.twitter.com",
      "mobile.twitter.com",
    ].includes(host)
  ) {
    const match =
      /^\/(?:[A-Za-z0-9_]{1,15}\/status|i\/web\/status)\/(\d{1,25})(?:\/(?:photo|video)\/\d+)?\/?$/.exec(
        url.pathname,
      );
    return match
      ? {
          provider: "X",
          url: `https://x.com/i/web/status/${match[1]}`,
          embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${match[1]}&dnt=true`,
        }
      : null;
  }
  if (["instagram.com", "www.instagram.com"].includes(host)) {
    return instagramPost(url.pathname);
  }
  if (["linkedin.com", "www.linkedin.com"].includes(host))
    return linkedInPost(url.pathname);
  return null;
}
function linkedInPost(path: string): SocialPost | null {
  const direct =
    /^\/feed\/update\/(urn:li:(?:activity|share|ugcPost):\d{1,25})\/?$/.exec(
      path,
    );
  const slug =
    /^\/posts\/[A-Za-z0-9_-]+-activity-(\d{1,25})-[A-Za-z0-9_-]+\/?$/.exec(
      path,
    );
  const urn = direct?.[1] || (slug ? `urn:li:activity:${slug[1]}` : "");
  return urn
    ? {
        provider: "LinkedIn",
        url: `https://www.linkedin.com/feed/update/${urn}/`,
        embedUrl: `https://www.linkedin.com/embed/feed/update/${urn}`,
      }
    : null;
}

function instagramPost(path: string): SocialPost | null {
  const match = /^\/(p|reel)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(path);
  if (!match) return null;
  const url = `https://www.instagram.com/${match[1]}/${match[2]}/`;
  return { provider: "Instagram", url, embedUrl: `${url}embed/` };
}
