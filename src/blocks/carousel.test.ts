import { sanitize } from "hast-util-sanitize";
import assert from "node:assert/strict";
import test from "node:test";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { expandContentTags } from "../../shared/content-tags";
import { markdownSchema } from "../markdown-schema";
import { carouselMarkdown } from "./carousel";

test("carousel attributes round-trip quotes, ampersands, and attempted directive injection as text", () => {
  const image = {
    src: "https://example.com/one.png?a=1&b=2",
    alt: 'A "quoted" <diagram>',
    caption: 'Text"}\n::video{src="https://example.com/video.mp4"}',
  };
  const markdown = carouselMarkdown([image, image], 'One & "two"', "cover");
  const tree = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .parse(expandContentTags(markdown)) as any;
  assert.equal(tree.children.length, 1);
  const carousel = tree.children[0];
  assert.equal(carousel.name, "carousel");
  assert.deepEqual(carousel.attributes, { title: 'One & "two"', fit: "cover" });
  assert.equal(carousel.children.length, 2);
  for (const slide of carousel.children) {
    assert.equal(slide.name, "image");
    assert.equal(slide.attributes.src, image.src);
    assert.equal(slide.attributes.alt, image.alt);
    assert.equal(slide.attributes.caption, image.caption.replace(/\n/g, " "));
  }
});

test("carousel insertion rejects unsafe URLs and incomplete or oversized galleries", () => {
  const image = { src: "https://example.com/image.png", alt: "", caption: "" };
  for (const src of [
    "javascript:alert(1)",
    "data:image/svg+xml,hello",
    "//example.com/image.png",
    "https://user:pass@example.com/image.png",
  ]) {
    assert.throws(
      () => carouselMarkdown([{ ...image, src }, image]),
      /valid HTTP/,
    );
  }
  for (const count of [0, 1, 21])
    assert.throws(
      () => carouselMarkdown(Array(count).fill(image)),
      /between 2 and 20/,
    );
  assert.ok(carouselMarkdown(Array(20).fill(image)).includes("[Carousel"));
  assert.ok(
    carouselMarkdown([
      { ...image, src: "/api/assets/12345678-1234-1234-1234-123456789abc.png" },
      image,
    ]).includes("/api/assets/"),
  );
});

test("sanitization retains only supported carousel presentation metadata", () => {
  const result = sanitize(
    {
      type: "element",
      tagName: "div",
      properties: {
        className: ["md-carousel", "evil"],
        dataCarouselTitle: "Gallery",
        dataCarouselFit: "cover",
        style: "position:fixed",
        onClick: "bad()",
      },
      children: [],
    },
    markdownSchema,
  ) as any;
  assert.deepEqual(result.properties, {
    className: ["md-carousel"],
    dataCarouselTitle: "Gallery",
    dataCarouselFit: "cover",
  });
});
