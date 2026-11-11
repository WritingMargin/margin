// Only the writer workspace shell and versioned code are stored. API responses
// and public pages are deliberately excluded from the offline cache.
const scope = new URL(self.registration.scope);
const base = scope.pathname.replace(/\/$/, "");
const cachePrefix = `margin-writer-${encodeURIComponent(scope.pathname)}-`;
const cacheName = `${cachePrefix}__MARGIN_BUILD_HASH__`;
const workspace = `${base}/admin`;
const assets = `${base}/assets/`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

async function cachedWriterResponse(request) {
  const names = [cacheName, ...(await caches.keys()).filter(name =>
    name !== cacheName && (name.startsWith(cachePrefix) || (base === "" && /^margin-writer-[a-f0-9]{12}$/.test(name))),
  ).reverse()];
  for (const name of names) {
    const response = await (await caches.open(name)).match(request);
    if (response) return response;
  }
  return undefined;
}

self.addEventListener("message", event => {
  if (event.data?.type !== "warm-writer") return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(cacheName);
      const shell = await fetch(workspace, { credentials: "same-origin", cache: "no-store" });
      if (!shell.ok) return;
      const html = await shell.clone().text();
      const linked = [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+/g)].map(match => `${scope.origin}${base}${match[0]}`);
      if (!linked.some(url => /\.m?js$/.test(url))) return;
      const urls = [...new Set([...(Array.isArray(event.data.assets) ? event.data.assets : []), ...linked])];
      const assetURLs = urls.filter(url => {
      try {
        const parsed = new URL(url, scope);
        return parsed.origin === scope.origin && parsed.pathname.startsWith(assets);
      } catch { return false; }
      });
      if (!assetURLs.length) return;
      const results = await Promise.all(assetURLs.map(async url => {
        try {
          const response = await fetch(url, { credentials: "same-origin" });
          if (!response.ok) return false;
          await cache.put(url, response);
          return true;
        } catch { return false; }
      }));
      if (results.some(result => !result)) return;
      await cache.put(workspace, shell);
      for (const name of await caches.keys()) {
        if (name !== cacheName && name.startsWith(cachePrefix)) await caches.delete(name);
      }
    } catch { /* Keep the previous cache if warming fails. */ }
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== scope.origin) return;
  if (request.mode === "navigate" && url.pathname === `${base}/`) {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cached = await cachedWriterResponse(workspace);
        return cached ? Response.redirect(`${scope.origin}${workspace}/posts/new`, 302) : Response.error();
      }
    })());
    return;
  }
  if (request.mode === "navigate" && (url.pathname === workspace || url.pathname.startsWith(`${workspace}/`))) {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cached = await cachedWriterResponse(workspace);
        if (cached) return cached;
        return Response.error();
      }
    })());
    return;
  }
  if (!url.pathname.startsWith(assets)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cachedWriterResponse(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
