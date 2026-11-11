export type HostedMedia = { provider: string; src: string; url: string };

const publishedPlayers = new Map<string, { provider: string; path: RegExp; origin: string; embed: string; view: string }>([
  ["share.descript.com", { provider: "Descript", path: /^\/(?:view|embed)\/([a-zA-Z0-9_-]{6,64})\/?$/, origin: "https://share.descript.com", embed: "/embed/", view: "/view/" }],
  ...["veed.io", "www.veed.io"].map(host => [host, { provider: "VEED", path: /^\/(?:view|embed)\/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\/?$/, origin: "https://www.veed.io", embed: "/embed/", view: "/view/" }] as const),
  ["api.riverside.fm", { provider: "Riverside", path: /^\/embeddable-components\/embedded-assets\/public\/([a-zA-Z0-9_-]{6,128})\/?$/, origin: "https://api.riverside.fm", embed: "/embeddable-components/embedded-assets/public/", view: "/embeddable-components/embedded-assets/public/" }],
]);

/** Published players only: editor/project links never become embeds. */
export function resolveHostedMedia(url: URL): HostedMedia | undefined {
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return;
  const player = publishedPlayers.get(url.hostname);
  const match = player?.path.exec(url.pathname);
  if (!player || !match) return;
  return { provider: player.provider, src: `${player.origin}${player.embed}${match[1]}`, url: `${player.origin}${player.view}${match[1]}` };
}

/** Extract a known hosted player's URL, never execute or store pasted HTML. */
export function hostedMediaInput(value: string): string {
  const raw = value.trim();
  if (!raw.startsWith("<")) return raw;
  const frame = /^<iframe\b([^<>]*)>\s*<\/iframe>$/i.exec(raw);
  if (!frame) return raw;
  const sources = [...frame[1].matchAll(/(?:^|\s)src\s*=\s*(["'])(.*?)\1/gi)];
  if (sources.length !== 1) return raw;
  try {
    return resolveHostedMedia(new URL(sources[0][2].replaceAll("&amp;", "&")))?.url || raw;
  } catch { return raw; }
}
