import assert from "node:assert/strict";
import test from "node:test";
import { coverImageLimit } from "../shared/cover";
import { initialMediaDefaults, newMediaTag } from "../shared/media-defaults";
import { ImageInsertion, imageDropError } from "./editor/image-drop";

test("dropped images enforce the existing upload formats and size limit", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
    assert.equal(imageDropError({ type, size: coverImageLimit }), "");
  }
  assert.match(
    imageDropError({ type: "image/png", size: coverImageLimit + 1 }),
    /10 MB/,
  );
  for (const type of ["image/svg+xml", "text/plain", "", "video/mp4"]) {
    assert.match(imageDropError({ type, size: 20 }), /PNG/);
  }
});

test("an upload inserts at the captured cursor without replacing selected or surrounding text", () => {
  const insertion = new ImageInsertion("Before. After.", 8);
  assert.equal(
    insertion.insert('[Image src="one"]'),
    'Before. \n\n[Image src="one"]\n\nAfter.',
  );
});

test("pending uploads follow edits before the insertion point and preserve edits after it", () => {
  const insertion = new ImageInsertion("Before.\n\nAfter.", 9);
  insertion.update("Introduction.\n\nBefore.\n\nAfter.");
  insertion.update("Introduction.\n\nBefore.\n\nAfter. More writing.");
  assert.equal(
    insertion.insert("IMAGE"),
    "Introduction.\n\nBefore.\n\nIMAGE\n\nAfter. More writing.",
  );
});

test("deleting or replacing the passage containing the upload cursor never restores deleted text", () => {
  const insertion = new ImageInsertion("Before. Delete me. After.", 12);
  insertion.update("Before. Replacement. After.");
  assert.equal(
    insertion.insert("IMAGE"),
    "Before. Replacement\n\nIMAGE\n\n. After.",
  );
  const cleared = new ImageInsertion("Discarded draft", 8);
  cleared.update("");
  assert.equal(cleared.insert("IMAGE"), "IMAGE\n\n");
});

test("multiple images retain drop order and saved layout while typing continues", () => {
  const insertion = new ImageInsertion("After.", 0);
  const defaults = {
    ...initialMediaDefaults,
    image: { frame: "polaroid", width: "small", align: "right" },
  };
  const first = newMediaTag("image", "/api/public/covers/one", defaults);
  const second = newMediaTag("image", "/api/public/covers/two", defaults);
  insertion.insert(first);
  insertion.update(`${first}\n\nNew thought. After.`);
  assert.equal(
    insertion.insert(second),
    `${first}\n\nNew thought. \n\n${second}\n\nAfter.`,
  );
});
