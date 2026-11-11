/** Opaque identity only: never send media URLs or their access tokens to analytics. */
export function mediaIdentity(kind: "audio" | "video", src: string): string {
  let value = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(`${kind}\n${src.trim()}`)) {
    value ^= BigInt(byte);
    value = BigInt.asUintN(64, value * 1099511628211n);
  }
  return value.toString(16).padStart(16, "0");
}
