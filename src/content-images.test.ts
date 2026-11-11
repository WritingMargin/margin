import assert from "node:assert/strict";
import test from "node:test";
import { contentImages } from "./content-images";

test("cover candidates include Markdown, references, image tags and carousel slides in order", () => {
  const content = `![Diagram](https://example.com/diagram.png)

![Reference][photo]

[photo]: https://example.com/photo.jpg

[Carousel title="Photos"]
[Image src="https://example.com/slide.webp" alt="Slide"]
[/Carousel]

::image{src="https://example.com/legacy.jpg" caption="Legacy"}

![Duplicate](https://example.com/diagram.png)`;
  assert.deepEqual(contentImages(content), [
    { url: "https://example.com/diagram.png", alt: "Diagram" },
    { url: "https://example.com/photo.jpg", alt: "Reference" },
    { url: "https://example.com/slide.webp", alt: "Slide" },
    { url: "https://example.com/legacy.jpg", alt: "Legacy" },
  ]);
});
test("cover candidates exclude code, videos, unsafe URLs, and unresolved references", () => {
  assert.deepEqual(
    contentImages(
      '```md\n![Sample](https://example.com/code.png)\n```\n\n`![Inline](https://example.com/inline.png)`\n\n[Video src="https://example.com/video.mp4"]\n\n::image{src="javascript:alert(1)"}\n\n![Missing][missing]\n\n![Private](https://user:secret@example.com/photo.png)',
    ),
    [],
  );
});
test("cover candidates retain authenticated generated images and uploaded covers", () => {
  const id = "7a2f9d33-11df-41e1-b3ba-99be02835f9c";
  const urls = [`/api/assets/${id}.png`, `/api/public/covers/${id}`];
  assert.deepEqual(
    contentImages(urls.map((url) => `![Image](${url})`).join("\n\n")).map(
      (image) => image.url,
    ),
    urls,
  );
});
