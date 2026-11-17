import assert from "node:assert/strict";
import test from "node:test";
import { loadTeamPage } from "./team/team-pagination";

test("team lists request independent server pages and preserve SQL totals", async t => {
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    paths.push(path);
    assert.equal(init.credentials, "same-origin");
    const collection = path.includes("/members?") ? "members" : "invitations";
    return Response.json({ [collection]: [{ id: collection }], page: 2, pageSize: 10, pages: 2, total: 11 });
  });
  const signal = new AbortController().signal;
  const members = await loadTeamPage("members", 2, 10, signal);
  const invites = await loadTeamPage("invitations", 2, 10, signal);
  assert.deepEqual(paths, ["/api/team/members?page=2&pageSize=10", "/api/team/invitations?page=2&pageSize=10"]);
  assert.deepEqual(members, { items: [{ id: "members" }], page: 2, pageSize: 10, pages: 2, total: 11 });
  assert.deepEqual(invites.items, [{ id: "invitations" }]);
});

test("team page uses the server-clamped page after final-row removal", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ invitations: [{ id: "remaining" }], page: 1, pageSize: 10, pages: 1, total: 1 }));
  const page = await loadTeamPage("invitations", 2, 10, new AbortController().signal);
  assert.equal(page.page, 1);
  assert.equal(page.pages, 1);
  assert.equal(page.total, 1);
  assert.deepEqual(page.items, [{ id: "remaining" }]);
});

test("obsolete team responses are rejected even when transport ignores abort", async t => {
  let finish!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => { finish = resolve; }));
  const request = new AbortController();
  const pending = loadTeamPage("members", 1, 10, request.signal);
  request.abort();
  finish(Response.json({ members: [{ id: "stale" }], page: 1, pageSize: 10, pages: 1, total: 1 }));
  await assert.rejects(pending, { name: "AbortError" });
});

test("team pagination reports server failures rather than an empty success", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Only owners can manage the team." }, { status: 403 }));
  await assert.rejects(loadTeamPage("members", 1, 10, new AbortController().signal), /Only owners/);
});
