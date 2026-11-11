// The server stores a domain override and appends its configured mount path.
// Accept the displayed full address without persisting that path a second time.
export function domainOverride(value: string, mount: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (mount && url.pathname.replace(/\/$/, "") === mount) {
      url.pathname = "/";
      return url.toString();
    }
  } catch {
    // Let the server return its normal validation message.
  }
  return raw;
}
