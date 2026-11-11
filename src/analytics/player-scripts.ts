const scripts = new Map<string, Promise<void>>();
export function playerScript(url: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  const existing = scripts.get(url);
  if (existing) return existing;
  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    const start = performance.now();
    const clock = window.setInterval(() => {
      if (ready()) { window.clearInterval(clock); resolve(); }
      else if (performance.now() - start > 15_000) fail();
    }, 50);
    function fail() {
      window.clearInterval(clock);
      script.remove();
      scripts.delete(url);
      reject(new Error("Player API unavailable"));
    }
    script.onerror = fail;
    document.head.append(script);
  });
  scripts.set(url, pending);
  return pending;
}

// SDKs validate their own cross-origin messages. Only hand them frames from the
// exact documented player origin, never URLs supplied directly by a post.
export function trustedPlayer(frame: Pick<HTMLIFrameElement, "src">, provider: string) {
  const origins: Record<string, string[]> = {
    youtube: ["https://www.youtube-nocookie.com", "https://www.youtube.com"],
    vimeo: ["https://player.vimeo.com"],
    soundcloud: ["https://w.soundcloud.com"],
    spotify: ["https://open.spotify.com"],
  };
  try { return origins[provider]?.includes(new URL(frame.src).origin) || false; }
  catch { return false; }
}

export function mediaCollection(frame: Pick<HTMLIFrameElement, "src">, provider: string): boolean {
  const url = new URL(frame.src);
  if (provider === "spotify") return !/^\/embed\/(episode|track)\//.test(url.pathname);
  if (provider === "soundcloud") {
    const target = new URL(url.searchParams.get("url") || "https://soundcloud.com");
    return /\/sets\/|^\/playlists\//.test(target.pathname);
  }
  return false;
}
