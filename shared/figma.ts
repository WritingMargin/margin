/** Convert a design share link into the corresponding Figma Embed Kit URL. */
export function figmaEmbedUrl(source: string) {
  try {
    const url = new URL(source);
    if (
      ![
        "https://www.figma.com",
        "https://figma.com",
        "https://embed.figma.com",
      ].includes(url.origin) ||
      url.username ||
      url.password
    )
      return;
    const match =
      /^\/(design|file|proto|board)\/([A-Za-z0-9]+)(?:\/[^/]*)?\/?$/.exec(
        url.pathname,
      );
    if (!match) return;
    const type = match[1] === "file" ? "design" : match[1];
    const embed = new URL(`https://embed.figma.com/${type}/${match[2]}`);
    for (const key of [
      "node-id",
      "page-id",
      "starting-point-node-id",
      "scaling",
      "content-scaling",
      "viewport",
      "version-id",
    ]) {
      const value = url.searchParams.get(key);
      if (value) embed.searchParams.set(key, value);
    }
    embed.searchParams.set("embed-host", "margin");
    return embed.href;
  } catch {
    return;
  }
}
