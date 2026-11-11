import assert from "node:assert/strict";
import test from "node:test";
import { figmaEmbedUrl } from "../../shared/figma";
import { illustrationSchema } from "./illustration-schema";

test("Figma embeds preserve prototype selection and only target Figma’s embed origin", () => {
  const source =
    "https://www.figma.com/proto/Ab123/My-file?node-id=32-5&starting-point-node-id=3%3A1";
  const url = new URL(figmaEmbedUrl(source)!);
  assert.equal(
    url.origin + url.pathname,
    "https://embed.figma.com/proto/Ab123",
  );
  assert.equal(url.searchParams.get("starting-point-node-id"), "3:1");
  assert.equal(url.searchParams.get("node-id"), "32-5");
  assert.equal(url.searchParams.get("embed-host"), "margin");
  for (const invalid of [
    source.replace(".com", ".com.evil.test"),
    source.replace("https:", "http:"),
    source.replace("www.", "user@www."),
    source.replace("/proto/", "/redirect/"),
  ])
    assert.equal(figmaEmbedUrl(invalid), undefined);
});
test("artwork can replace hand-authored paths while retaining region checks", () => {
  const spec = {
    title: "Plan",
    regions: [{ id: "a", label: "A", description: "Entry", x: 1, y: 2 }],
  };
  assert.equal(illustrationSchema.safeParse(spec).success, false);
  assert.deepEqual(
    illustrationSchema.parse({
      ...spec,
      artwork: { src: "/plan.svg", alt: "Floor plan" },
    }).shapes,
    [],
  );
  assert.equal(
    illustrationSchema.safeParse({
      ...spec,
      artwork: { src: "javascript:alert(1)", alt: "Plan" },
    }).success,
    false,
  );
});
