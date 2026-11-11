import assert from "node:assert/strict";
import test from "node:test";
import {
  activeDelta,
  cleanClickURL,
  normalizedPassage,
  readingDepth,
} from "./analytics/measurement";
import { analyticsTransport, analyticsDelivery } from "./analytics/transport";
import type { AnalyticsBatch, AnalyticsEvent } from "../shared/analytics";

test("active time excludes hidden and idle tabs, and bounds delayed timer samples", () => {
  assert.equal(activeDelta(5000, 4000, 1000, true), 1000);
  assert.equal(activeDelta(5000, 4000, 1000, false), 0);
  assert.equal(activeDelta(70000, 69000, 1000, true), 0);
  assert.equal(activeDelta(20000, 1000, 19000, true), 2000);
  assert.equal(activeDelta(1000, 2000, 1000, true), 0);
});
test("scroll depth measures article visibility without including the footer", () => {
  assert.equal(readingDepth(200, 2000, 800), 30);
  assert.equal(readingDepth(-1200, 2000, 800), 100);
  assert.equal(readingDepth(1200, 2000, 800), 0);
  assert.equal(readingDepth(0, 0, 800), 0);
});
test("click destinations discard query and fragment secrets and reject unsafe protocols", () => {
  const base = "https://margin.test/blog/";
  assert.equal(
    cleanClickURL("/blog/post/story?email=private#token", base),
    "/blog/post/story",
  );
  assert.equal(
    cleanClickURL("https://other.test/read?token=secret", base),
    "https://other.test/read",
  );
  assert.equal(cleanClickURL("mailto:reader@example.test", base), null);
  assert.equal(cleanClickURL("javascript:alert(1)", base), null);
  assert.equal(cleanClickURL("https://user:pass@other.test", base), null);
  assert.equal(
    normalizedPassage("  Words\n worth\tkeeping. "),
    "Words worth keeping.",
  );
  assert.equal(normalizedPassage("x".repeat(600)).length, 500);
});
test("delivery retries retain IDs, acknowledgments clear events, snapshots remain cumulative", async () => {
  const original = globalThis.fetch;
  const sent: AnalyticsBatch[] = [];
  let attempt = 0;
  globalThis.fetch = async (_input, init) => {
    sent.push(JSON.parse(String(init?.body)));
    if (++attempt === 1) throw new Error("offline");
    return new Response(null, { status: 204 });
  };
  try {
    const snapshot: AnalyticsBatch = {
      viewId: "view",
      sessionId: "session",
      postId: "",
      revision: "",
      activeMs: 1000,
      scrollDepth: 20,
      sections: [],
      events: [],
    };
    const transport = analyticsTransport(() => snapshot);
    const event: AnalyticsEvent = {
      id: "same-event",
      kind: "click",
      target: "/post/story",
      sectionId: "",
    };
    transport.add(event);
    await transport.send();
    snapshot.activeMs = 2000;
    await transport.send();
    await transport.send();
    assert.deepEqual(sent[0].events, [event]);
    assert.deepEqual(sent[1].events, [event]);
    assert.deepEqual(sent[2].events, []);
    assert.equal(sent[1].activeMs, 2000);
  } finally {
    globalThis.fetch = original;
  }
});

test("multilingual batches fit within the final-delivery byte budget", () => {
  const event: AnalyticsEvent = {
    id: "event",
    kind: "highlight",
    target: "界".repeat(500),
    sectionId: "intro",
  };
  const snapshot: AnalyticsBatch = {
    viewId: "view",
    sessionId: "session",
    postId: "post",
    revision: "revision",
    activeMs: 100000,
    scrollDepth: 100,
    sections: Array.from({ length: 100 }, (_, i) => ({
      id: `section-${i}`,
      label: "界".repeat(200),
      activeMs: 1000,
    })),
    events: [],
  };
  const delivery = analyticsDelivery(
    snapshot,
    Array.from({ length: 30 }, (_, i) => ({ ...event, id: `event-${i}` })),
  );
  assert.ok(new Blob([delivery.body]).size <= 60000);
  assert.ok(delivery.events.length > 0 && delivery.events.length < 30);
  assert.equal(JSON.parse(delivery.body).sections.length, 100);
});
