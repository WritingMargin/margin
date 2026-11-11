export const IDLE_MS = 60_000;
export function activeDelta(
  now: number,
  previous: number,
  lastActivity: number,
  visible: boolean,
): number {
  if (!visible || now - lastActivity > IDLE_MS) return 0;
  return Math.max(0, Math.min(2000, Math.round(now - previous)));
}
export function readingDepth(
  top: number,
  height: number,
  viewport: number,
): number {
  if (height <= 0) return 0;
  return Math.round(
    Math.max(0, Math.min(100, ((viewport - top) / height) * 100)),
  );
}
export function cleanClickURL(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const origin = new URL(base).origin;
    return (
      url.origin === origin ? url.pathname : url.origin + url.pathname
    ).slice(0, 500);
  } catch {
    return null;
  }
}
export function normalizedPassage(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 500).trim();
}
export function analyticsID(): string {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (value) =>
    (
      +value ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+value / 4)))
    ).toString(16),
  );
}
export function readingSession(): string {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("margin-reading-session") || "null",
    );
    const id: string = saved?.expires > Date.now() ? saved.id : analyticsID();
    sessionStorage.setItem(
      "margin-reading-session",
      JSON.stringify({ id, expires: Date.now() + 30 * 60_000 }),
    );
    return id;
  } catch {
    return analyticsID();
  }
}
