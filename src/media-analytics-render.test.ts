import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnalyticsMediaRow, AnalyticsReport } from "../shared/analytics";

const recording: AnalyticsMediaRow = {
  post_id: "article",
  title: "An article",
  media_id: "recording",
  media_title: "An interview",
  media_type: "audio",
  provider: "native",
  views: 5,
  measurable_views: 4,
  timeline_available: 1,
  starts: 3,
  played_ms: 30000,
  progress: 50,
  completed: 1,
  replay_ms: Array.from({ length: 20 }, (_, index) => (index === 4 ? 1500 : 0)),
  replay_measured_views: 2,
  duration_ms: 120000,
};

test("media replay and stop duration reports distinguish measured, historical, and unavailable activity", async () => {
  const dir = await mkdtemp(path.join(process.cwd(), ".media-render-test-"));
  try {
    const outfile = path.join(dir, "renderer.mjs");
    await build({
      stdin: {
        contents: `export { default as Replay } from "./src/analytics/AnalyticsMediaReplay";
        export { default as Media } from "./src/analytics/AnalyticsMedia";
        export { default as Events } from "./src/analytics/AnalyticsMediaEvents";
        export { AnalyticsControls } from "./src/analytics/AnalyticsControls";`,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      loader: { ".css": "empty" },
      outfile,
      jsx: "automatic",
    });
    const { Replay, Media, Events, AnalyticsControls } = (await import(
      pathToFileURL(outfile).href
    )) as {
      Replay: typeof import("./analytics/AnalyticsMediaReplay").default;
      Media: typeof import("./analytics/AnalyticsMedia").default;
      Events: typeof import("./analytics/AnalyticsMediaEvents").default;
      AnalyticsControls: typeof import("./analytics/AnalyticsControls").AnalyticsControls;
    };
    const renderReplay = (item: AnalyticsMediaRow) =>
      renderToStaticMarkup(createElement(Replay, { item }));
    const controls = (child: ReactNode) =>
      createElement(
        AnalyticsControls.Provider,
        {
          value: {
            mode: "details",
            loading: false,
            expanded: null,
            pagination: {
              media: { total: 1, offset: 0, pageSize: 10 },
              mediaEvents: { total: 5, offset: 0, pageSize: 10 },
            } as AnalyticsReport["pagination"],
            paginate() {},
            showDetails() {},
          },
        },
        child,
      );
    const renderReport = (
      Component: ComponentType<{ data: AnalyticsReport }>,
      data: Partial<AnalyticsReport>,
    ) =>
      renderToStaticMarkup(
        controls(createElement(Component, { data: data as AnalyticsReport })),
      );

    for (const media_type of ["audio", "video"] as const) {
      const html = renderReport(Media, {
        media: [{ ...recording, media_type }],
      });
      assert.match(html, /Most replayed: 20–25% \(0:24.0–0:30.0\) · 1.5s/);
      assert.match(html, /role="img" aria-label="Replay timeline/);
      assert.match(html, /Replay time by recording segment/);
      assert.match(html, /same page visit, summed across 2 measured visits/);
      assert.match(
        html,
        /<th scope="row">20–25%<\/th><td>0:24.0–0:30.0<\/td><td>1.5s/,
      );
    }
    assert.match(
      renderReplay({ ...recording, replay_ms: Array(20).fill(0) }),
      /No replays recorded/,
    );
    const historical = renderReplay({
      ...recording,
      replay_ms: null,
      replay_measured_views: 0,
    });
    assert.match(historical, /Replay measurement unavailable/);
    assert.doesNotMatch(historical, /No replays recorded|role="img"/);
    const collection = renderReplay({ ...recording, timeline_available: 0 });
    assert.match(collection, /unavailable for this player or collection/);
    assert.doesNotMatch(collection, /role="img"/);
    const mixedDurations = renderReplay({ ...recording, duration_ms: null });
    assert.match(mixedDurations, /Most replayed: 20–25% · 1.5s/);
    assert.doesNotMatch(mixedDurations, /0:24.0/);
    assert.match(
      renderReplay({ ...recording, replay_ms: Array(20).fill(1500) }),
      /joint highest/,
    );

    const baseEvent = {
      id: "event",
      post_id: "article",
      title: "An article",
      media_id: "recording",
      media_title: "An interview",
      media_type: "video" as const,
      provider: "native",
      occurred_at: "2026-10-29T12:30:10Z",
      position_ms: 90000,
    };
    const events = renderReport(Events, {
      mediaEvents: [
        { ...baseEvent, id: "pause", kind: "pause", played_ms: 12500 },
        { ...baseEvent, id: "exit", kind: "exit", played_ms: 250 },
        { ...baseEvent, id: "ended", kind: "ended", played_ms: 0 },
        { ...baseEvent, id: "historical", kind: "pause", played_ms: null },
        { ...baseEvent, id: "seek", kind: "seek", played_ms: null },
      ],
    });
    assert.match(events, /Played before stop/);
    assert.match(events, /Left page/);
    assert.match(events, /<td>1:30.0<\/td><td>12.5s<\/td>/);
    assert.match(events, /<td>250ms<\/td>/);
    assert.match(events, /<td>0s<\/td>/);
    assert.equal((events.match(/<td>—<\/td>/g) || []).length, 2);
    assert.match(events, /Hiding a tab alone does not end a playback session/);
    const homepage = renderReport(Media, { media: [{ ...recording, post_id: "home", title: "Homepage", media_title: "Homepage hero", media_type: "video" }] });
    assert.match(homepage, /Recording \/ page/);
    assert.match(homepage, /Homepage hero/);
    assert.match(homepage, /Homepage ·/);
    const homepageEvents = renderReport(Events, { mediaEvents: [{ ...baseEvent, post_id: "home", title: "Homepage", media_title: "Homepage hero", kind: "pause", played_ms: 2500 }] });
    assert.match(homepageEvents, /Homepage ·/);
    assert.match(homepageEvents, /2.5s/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
