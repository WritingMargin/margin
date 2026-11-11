export type LinkPreview = { url: string; title: string; description: string; image: string };
export function linkURL(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Incomplete author input. */ }
}
