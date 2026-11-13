import assert from "node:assert/strict";
import test from "node:test";
import type { Post } from "../shared/types";
import { readEditablePost, persistEditablePost } from "./admin/team-posts";
const live: Post = { id: "post", title: "Live", slug: "live", excerpt: "", content: "Live text", status: "published", tags: [], cover: "", seo: { title: "", description: "", image: "" }, createdAt: "", updatedAt: "", revision: "live-revision", baseRevision: "live-revision" };
const staged: Post = { ...live, title: "Proposed title", content: "Proposed text", status: "draft", revision: "draft-revision" };
test("opening a published article uses the working draft for review", async context => {
  const paths: string[] = [];
  context.mock.method(globalThis, "fetch", async (path: string) => { paths.push(path); return Response.json(path.endsWith("/draft") ? staged : live); });
  assert.deepEqual(await readEditablePost("post"), staged);
  assert.deepEqual(paths, ["/api/posts/post", "/api/posts/post/draft"]);
});
test("saving published changes only stages and publishing uses the saved revision", async context => {
  const calls: { path: string; input: Record<string, unknown> }[] = [];
  context.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body)); calls.push({ path, input });
    return Response.json(path.endsWith("/publish") ? { ...staged, status: "published", revision: "new-live" } : staged);
  });
  await persistEditablePost({ ...live, content: "Proposed text" }, false, live);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/posts/post/draft");
  assert.equal(calls[0].input.status, "draft");
  assert.equal(calls[0].input.revision, "live-revision");
  assert.equal("baseRevision" in calls[0].input, false);
  calls.length = 0;
  await persistEditablePost(staged, true, staged);
  assert.deepEqual(calls.map(call => call.path), ["/api/posts/post/draft", "/api/posts/post/draft/publish"]);
  assert.deepEqual(calls[1].input, { revision: "draft-revision" });
});
test("a draft conflict never advances to publishing", async context => {
  const paths: string[] = [];
  context.mock.method(globalThis, "fetch", async (path: string) => { paths.push(path); return Response.json({ error: "Draft changed", code: "REVISION_CONFLICT" }, { status: 409 }); });
  await assert.rejects(persistEditablePost(staged, true, staged), /Draft changed/);
  assert.deepEqual(paths, ["/api/posts/post/draft"]);
});

test("a failed publication retains the saved draft revision for retry", async context => {
  const { DraftPublishError } = await import("./admin/team-posts");
  context.mock.method(globalThis, "fetch", async (path: string) => path.endsWith("/publish") ? Response.json({ error: "Service unavailable" }, { status: 503 }) : Response.json({ ...staged, revision: "saved-before-failure" }));
  await assert.rejects(persistEditablePost(staged, true, staged), error => {
    assert.ok(error instanceof DraftPublishError);
    assert.equal(error.savedDraft.revision, "saved-before-failure");
    assert.match(error.message, /draft was saved/);
    return true;
  });
});
test("unpublishing and archiving target the reviewed live revision, preserving staged content on the server", async context => {
  const { changePublishedVisibility } = await import("./admin/team-posts");
  const bodies: unknown[] = [];
  context.mock.method(globalThis, "fetch", async (_path: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return Response.json(staged); });
  await changePublishedVisibility(staged, "draft");
  await changePublishedVisibility(staged, "archived");
  assert.deepEqual(bodies, [{ revision: "live-revision", status: "draft" }, { revision: "live-revision", status: "archived" }]);
});
