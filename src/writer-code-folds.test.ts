import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { writerCodeBlocks } from "./editor/writer-code-blocks";
import {
  toggleWriterCode,
  writerCodeFolds,
  foldedCodeStart,
} from "./editor/writer-code-folds";

test("labels fenced code and Margin embeds without consuming adjacent prose", () => {
  const source =
    'Before\n\n```python\nprint("hello")\n```\n\n[Chart]\n{"data":[1,2]}\n[/Chart]\n\nAfter';
  const blocks = writerCodeBlocks(source);
  assert.deepEqual(
    blocks.map((block) => block.label),
    ["Python code", "Chart"],
  );
  assert.equal(
    source.slice(blocks[0].from, blocks[0].to),
    '```python\nprint("hello")\n```',
  );
  assert.equal(
    source.slice(blocks[1].from, blocks[1].to),
    '[Chart]\n{"data":[1,2]}\n[/Chart]',
  );
});
test("unfinished fences stay editable and longer fences protect nested examples", () => {
  assert.equal(writerCodeBlocks("```python\nprint(1)").length, 0);
  assert.equal(writerCodeBlocks("[Chart]\n{}").length, 0);
  const blocks = writerCodeBlocks(
    '````markdown\n```python\nx\n```\n````\n\n~~~ipynb\n{"cells":[{},{}]}\n~~~',
  );
  assert.deepEqual(
    blocks.map((block) => block.label),
    ["Markdown code", "Jupyter notebook · 2 cells"],
  );
});
test("folding and expanding never mutate source and expanded code follows prose edits", () => {
  const source = "Intro\n\n```js\nconst x = 1;\n```\n\nEnd";
  const block = writerCodeBlocks(source)[0];
  let state = EditorState.create({
    doc: source,
    extensions: [writerCodeFolds],
  });
  state = state.update({
    effects: toggleWriterCode.of({ from: block.from, open: true }),
  }).state;
  assert.equal(state.doc.toString(), source);
  assert(state.field(writerCodeFolds).expanded.has(block.from));
  state = state.update({ changes: { from: 0, insert: "New " } }).state;
  assert(state.field(writerCodeFolds).expanded.has(block.from + 4));
  state = state.update({
    effects: toggleWriterCode.of({ from: block.from + 4, open: false }),
  }).state;
  assert.equal(state.doc.toString(), "New " + source);
  assert.equal(state.field(writerCodeFolds).expanded.size, 0);
});
test("all non-text embeds fold while font, citations and text containers stay visible", () => {
  const source = [
    '[Font="Caveat"]Visible writing[/Font]',
    '[Citation url="https://example.test"]Visible quote[/Citation]',
    '[Callout tone="note"]',
    "Visible prose",
    "[/Callout]",
    '[Image src="https://example.test/a.jpg" caption="A photo"]',
    '[Video src="https://example.test/a.mp4"]',
    '[Audio src="https://example.test/a.mp3"]',
    '[Social url="https://example.test/post"]',
    '[Link url="https://example.test"]',
    '[Spotify src="https://example.test/episode"]',
    '[SoundCloud src="https://example.test/recording"]',
    "![A photo](https://example.test/b.jpg)",
    "[Carousel]",
    '[Image src="https://example.test/c.jpg"]',
    "[/Carousel]",
    '::video{src="https://example.test/b.mp4"}',
  ].join("\n");
  assert.deepEqual(
    writerCodeBlocks(source).map((block) => block.label),
    [
      "Image",
      "Video",
      "Audio",
      "Social post",
      "Link preview",
      "Spotify player",
      "SoundCloud player",
      "Image",
      "Image carousel",
      "Video",
    ],
  );
});
test("code nested inside lists and quotes also folds without swallowing prose", () => {
  const source =
    "- A point\n\n  ```js\n  console.log(1)\n  ```\n\n> A quote\n>\n> ```python\n> print(1)\n> ```\n\nAfter";
  const blocks = writerCodeBlocks(source);
  assert.deepEqual(
    blocks.map((block) => block.label),
    ["JavaScript code", "Python code"],
  );
  assert(!source.slice(blocks[0].from, blocks[0].to).includes("A point"));
  assert(!source.slice(blocks[1].from, blocks[1].to).includes("A quote"));
});

test("collapsed embeds flow inline after prose and share a row without changing paragraphs", () => {
  const source =
    'First paragraph.\n\nSecond paragraph.\n\n[Image src="photo.jpg"]\n\n[Video src="clip.mp4"]\n\nThird paragraph.';
  const blocks = writerCodeBlocks(source);
  assert.equal(
    foldedCodeStart(source, blocks[0].from),
    source.indexOf("Second paragraph.") + "Second paragraph.".length,
  );
  assert.equal(foldedCodeStart(source, blocks[1].from), blocks[0].to);
  const state = EditorState.create({
    doc: source,
    extensions: [writerCodeFolds],
  });
  const ranges: number[][] = [];
  state
    .field(writerCodeFolds)
    .decorations.between(0, source.length, (from, to) => {
      ranges.push([from, to]);
    });
  assert.deepEqual(
    ranges,
    blocks.map((block) => [foldedCodeStart(source, block.from), block.to]),
  );
  assert.equal(state.doc.toString(), source);
});
