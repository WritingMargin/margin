import assert from "node:assert/strict";
import test from "node:test";
import { videoLayout } from "../shared/video-layout";
import { getCompletions } from "./editor-completions";

test("video layouts support full width, fractions, percentages and explicit aspect ratios", () => {
  assert.equal(videoLayout({ width: "full" }).width, "100%");
  assert.equal(videoLayout({ width: "half" }).width, "50%");
  assert.deepEqual(
    videoLayout({ width: "40%", align: "right", wrap: "true", ratio: "4:3" }),
    {
      width: "40%",
      align: "right",
      wrap: true,
      ratio: "4:3",
      cssRatio: "4 / 3",
    },
  );
  assert.equal(
    videoLayout({ width: "third", align: "left", wrap: true }).wrap,
    true,
  );
});
test("video layout values cannot inject CSS and full-width/centered videos do not float", () => {
  for (const width of ["999%", "2%", "calc(100vw)", "40%;position:fixed"])
    assert.equal(videoLayout({ width }).width, "100%");
  assert.equal(videoLayout({ ratio: "1;display:none" }).cssRatio, "auto");
  assert.equal(
    videoLayout({ width: "full", align: "right", wrap: true }).wrap,
    false,
  );
  assert.equal(
    videoLayout({ width: "half", align: "center", wrap: true }).wrap,
    false,
  );
});
test("video tag suggestions expose width, wrapping and aspect ratio", () => {
  const text = "[Video ";
  const labels = getCompletions(text, text.length)!.items.map(
    (item) => item.label,
  );
  for (const property of ["width", "align", "wrap", "ratio"])
    assert.ok(labels.includes(property));
  const ratio = '[Video ratio="';
  assert.ok(
    getCompletions(ratio, ratio.length)!.items.some(
      (item) => item.label === "9:16",
    ),
  );
});
