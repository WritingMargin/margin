import { sitePath } from "./base-path";

export async function prepareOfflineWriter() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(sitePath("/offline-worker.js"), {
      scope: sitePath("/"),
    });
    await navigator.serviceWorker.ready;
    const worker = registration.active;
    if (!worker) return;
    const assets = performance.getEntriesByType("resource")
      .map(entry => entry.name)
      .filter(name => new URL(name).pathname.startsWith(sitePath("/assets/")));
    worker.postMessage({ type: "warm-writer", assets });
  } catch { /* Browser storage may be unavailable; online editing still works. */ }
}
