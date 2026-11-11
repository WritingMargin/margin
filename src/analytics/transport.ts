import type { AnalyticsBatch, AnalyticsEvent, AnalyticsMediaEvent } from "../../shared/analytics";
import { sitePath } from "../base-path";
function acknowledge<T extends { id: string }>(pending: T[], delivered: T[]) {
  const ids = new Set(delivered.map(event => event.id));
  for (let i = pending.length - 1; i >= 0; i--)
    if (ids.has(pending[i].id)) pending.splice(i, 1);
}
export function analyticsTransport(snapshot: () => AnalyticsBatch) {
  const pending: AnalyticsEvent[] = [], pendingMedia: AnalyticsMediaEvent[] = [];
  let sending = false, stopped = false;
  const endpoint = sitePath("/api/public/analytics");
  async function send() {
    if (sending || stopped) return;
    sending = true;
    const { events, mediaEvents, body } = analyticsDelivery(snapshot(), pending, pendingMedia);
    try {
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" }, body,
      });
      if (response.ok || response.status === 400) {
        acknowledge(pending, events);
        acknowledge(pendingMedia, mediaEvents);
      }
      if ([403, 404, 409].includes(response.status)) stopped = true;
    } catch {
      /* Retain IDs and original timestamps for a bounded retry. */
    } finally { sending = false; }
  }
  function flush() {
    if (stopped) return;
    const { body } = analyticsDelivery(snapshot(), pending, pendingMedia);
    const blob = new Blob([body], { type: "application/json" });
    if (!navigator.sendBeacon?.(endpoint, blob)) void send();
    // Keep IDs until acknowledged; duplicate beacon deliveries are safe.
  }
  return {
    send, flush,
    add(event: AnalyticsEvent) {
      if (stopped) return;
      if (pending.length < 100) pending.push(event);
      if (pending.length >= 20) void send();
    },
    addMedia(event: AnalyticsMediaEvent) {
      if (stopped) return;
      if (pendingMedia.length < 100) pendingMedia.push(event);
      if (pendingMedia.length >= 20) void send();
    },
  };
}

// Keep the combined UTF-8 payload below browser keepalive/beacon limits.
export function analyticsDelivery(snapshot: AnalyticsBatch, pending: AnalyticsEvent[], pendingMedia: AnalyticsMediaEvent[] = []) {
  const sections = snapshot.sections.map(section => ({ ...section, label: section.label.slice(0, 100) }));
  const events = pending.slice(0, 30), mediaEvents = pendingMedia.slice(0, 30);
  const serialize = () => JSON.stringify({ ...snapshot, sections, events, mediaEvents });
  let body = serialize();
  while (new Blob([body]).size > 60_000 && trimDelivery(events, mediaEvents, sections)) body = serialize();
  return { body, events, mediaEvents };
}
function trimDelivery(events: AnalyticsEvent[], mediaEvents: AnalyticsMediaEvent[], sections: AnalyticsBatch["sections"]) {
  if (events.length) { events.pop(); return true; }
  if (mediaEvents.length) { mediaEvents.pop(); return true; }
  if (sections.length) { sections.pop(); return true; }
  return false;
}
