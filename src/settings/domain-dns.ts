function dnsHostname(value: string): string | null {
  if (!value || /[\s/:@?#\[\]\\]/.test(value)) return null;
  try {
    const host = new URL(`https://${value}`).hostname.replace(/\.$/, "");
    if (host.length > 253 || !host.includes(".") || /^[\d.]+$/.test(host))
      return null;
    return host
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
      ? host
      : null;
  } catch {
    return null;
  }
}

export function publicDNSName(value: string): string | null {
  try {
    const raw = value.trim();
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return null;
    return dnsHostname(url.hostname);
  } catch {
    return null;
  }
}

export function cnameRecord(publicUrl: string, target: string) {
  const name = publicDNSName(publicUrl);
  const destination = dnsHostname(target.trim());
  if (!name)
    return {
      error: "Enter your public HTTPS domain above to see its DNS record.",
    };
  if (!destination)
    return {
      error:
        "Enter a hostname, such as server.example.net, without https://, a port, or a path. Use an A or AAAA record for an IP address.",
    };
  if (name === destination)
    return {
      error:
        "The target must be a different hostname. A CNAME cannot point to itself.",
    };
  return {
    name,
    target: destination,
    text: `${name}. IN CNAME ${destination}.`,
  };
}
