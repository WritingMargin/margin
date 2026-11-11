import assert from "node:assert/strict";
import test from "node:test";
import { generatedImageFilename, generatedImageTitle } from "../shared/image-title";
import { galleryImageTitle } from "./media/gallery-images";

test("generated images display their title while keeping their storage ID", () => {
  const asset = { public_id: "00000000-0000-4000-8000-000000000001", title: "Mountain village at sunrise", secure_url: "/api/assets/image.png" };
  assert.equal(galleryImageTitle(asset), asset.title);
  assert.equal(generatedImageFilename(asset.title), "mountain-village-at-sunrise.png");
  assert.equal(generatedImageTitle({ prompt: "Mountain village\n at sunrise." }), asset.title);
});

test("download names remove path separators and support Unicode", () => {
  assert.equal(generatedImageFilename("../../Café / dawn"), "café-dawn.png");
  assert.equal(generatedImageFilename("..."), "generated-illustration.png");
  assert.equal(generatedImageTitle({ prompt: "" }), "Generated illustration");
  assert.equal(galleryImageTitle({ public_id: "photos/landscape", secure_url: "https://example.test/a.png" }), "landscape");
});
