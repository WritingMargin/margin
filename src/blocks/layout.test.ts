import assert from "node:assert/strict";
import test from "node:test";
import {
sizeWidget,
textVisualRow,
widgetProperties,
widgetRow,
} from "./layout";

test("widget layout accepts supported widths, alignment, and bounded heights", () => {
  assert.deepEqual(
    widgetProperties("widget", {
      width: "half",
      align: "right",
      height: "320",
    }),
    {
      className: ["widget-frame", "widget-width-half", "widget-align-right"],
      dataWidgetHeight: "320",
    },
  );
  assert.deepEqual(widgetProperties("widgets", { columns: "3" }), {
    className: ["widget-grid", "widget-columns-3", "widget-ratio-equal"],
  });
  for (const height of ["200", "800"])
    assert.equal(
      widgetProperties("widget", { height })["dataWidgetHeight"],
      height,
    );
});
test("invalid layout values cannot inject CSS and fall back to responsive defaults", () => {
  for (const height of [
    "199",
    "801",
    "-300",
    "320.5",
    "300px",
    "300;background:url(https://example.com)",
  ]) {
    assert.equal(
      widgetProperties("widget", { height })["dataWidgetHeight"],
      undefined,
    );
  }
  assert.deepEqual(
    widgetProperties("widget", { width: "999vw", align: "fixed" }),
    { className: ["widget-frame", "widget-width-full", "widget-align-center"] },
  );
  assert.deepEqual(widgetProperties("widgets", { columns: "100" }), {
    className: ["widget-grid", "widget-columns-2", "widget-ratio-equal"],
  });
});
test("text columns group multiple Markdown blocks into one cell and bound the ratio", () => {
  assert.deepEqual(widgetProperties("column", {}), {
    className: ["widget-column"],
  });
  assert.deepEqual(widgetProperties("columns", { ratio: "wide-right" }), {
    className: ["widget-grid", "widget-columns-2", "widget-ratio-wide-right"],
  });
  assert.deepEqual(widgetProperties("columns", { ratio: "100vw" }), {
    className: ["widget-grid", "widget-columns-2", "widget-ratio-equal"],
  });
  const row = textVisualRow("```chart\n{}\n```", "360");
  assert.ok(row.startsWith('\n\n[Columns columns="2" ratio="equal"]'));
  assert.equal(row.match(/^\[Column\]$/gm)?.length, 2);
  assert.ok(row.includes('[Widget width="full" height="360"'));
  assert.ok(row.includes("## Explain the idea"));
  assert.ok(row.endsWith("[/Columns]\n\n"));
});
test("text wrapping only applies to fractional widths aligned left or right", () => {
  for (const align of ["left", "right"]) {
    assert.ok(
      widgetProperties("widget", {
        width: "half",
        align,
        wrap: "true",
      }).className.includes(`widget-wrap-${align}`),
    );
  }
  for (const attrs of [
    { width: "full", align: "left" },
    { width: "half", align: "center" },
  ]) {
    assert.ok(
      !widgetProperties("widget", { ...attrs, wrap: "true" }).className.some(
        (c) => c.startsWith("widget-wrap-"),
      ),
    );
  }
  assert.ok(
    sizeWidget(
      "```mermaid\nflowchart LR\nA-->B\n```",
      "half",
      "240",
      "left",
      true,
    ).includes('wrap="true"'),
  );
});
test("side-by-side insertion retains source and uses nested layout tags", () => {
  const chart = '```chart\n{"title":"A"}\n```';
  const diagram = "```mermaid\nflowchart LR\nA-->B\n```";
  const row = widgetRow([chart, diagram], 2, "240");
  assert.ok(row.startsWith('\n\n[Widgets columns="2"]\n'));
  assert.ok(row.endsWith("[/Widgets]\n\n"));
  assert.equal(row.match(/\[Widget /g)?.length, 2);
  assert.equal(row.match(/height="240"/g)?.length, 2);
  assert.ok(row.includes(chart));
  assert.ok(row.includes(diagram));
  assert.ok(!sizeWidget(chart).includes("height="));
});
