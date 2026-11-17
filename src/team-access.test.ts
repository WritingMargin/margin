import assert from "node:assert/strict";
import test from "node:test";
import { canOpenWorkspaceView, canPublish, memberWorkspaceKey } from "../shared/team";
import { readLocalDraft, writeLocalDraft } from "../shared/local-drafts";
import { offlineSessionAfterNetworkError, rememberOfflineSession, forgetOfflineSession } from "./auth/offline-session";
import { adminEntryDestination, adminUrl, parseAdminRoute } from "./admin-route";
import type { Post } from "../shared/types";
const alice = { id: "alice", name: "Alice", email: "alice@example.com" };
const bob = { id: "bob", name: "Bob", email: "bob@example.com" };
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const post: Post = { id: "post", title: "Draft", slug: "draft", excerpt: "", content: "Private text", status: "draft", tags: [], cover: "", seo: { title: "", description: "", image: "" }, createdAt: "", updatedAt: "", revision: "draft-revision", baseRevision: "live-revision" };
test("team roles restrict workspace views and publishing independently", () => {
  assert.equal(canPublish("writer"), false);
  assert.equal(canPublish("peer_reviewer"), false);
  assert.equal(canPublish("publisher"), true);
  assert.equal(canPublish("owner"), true);
  for (const view of ["settings", "designer", "pricing", "analytics", "readers"]) {
    assert.equal(canOpenWorkspaceView("writer", view), false);
    assert.equal(canOpenWorkspaceView("publisher", view), false);
    assert.equal(canOpenWorkspaceView("owner", view), true);
  }
  for (const view of ["posts", "editor", "media", "reviews"]) {
    assert.equal(canOpenWorkspaceView("writer", view), true);
    assert.equal(canOpenWorkspaceView("peer_reviewer", view), false);
  }
});
test("browser backups cannot mix different publication members and preserve staged revisions", () => {
  const store = storage();
  const aliceWorkspace = memberWorkspaceKey("/admin", alice);
  writeLocalDraft(store, aliceWorkspace, post, post);
  assert.equal(readLocalDraft(store, memberWorkspaceKey("/admin", bob), post.id), null);
  assert.equal(readLocalDraft(store, memberWorkspaceKey("/other/admin", alice), post.id), null);
  assert.equal(readLocalDraft(store, aliceWorkspace, post.id)?.post.baseRevision, "live-revision");
});
test("offline session restores the exact member and role, clears access on logout, never enables reviewers", () => {
  const store = storage(), key = "margin:offline-session:/admin", network = new TypeError("offline");
  rememberOfflineSession(store, key, { authenticated: true, storageConfigured: true, cloudManaged: true, user: alice, role: "writer", primaryOwner: false });
  const restored = offlineSessionAfterNetworkError(store, key, network);
  assert.equal(restored?.user?.id, "alice");
  assert.equal(restored?.role, "writer");
  assert.equal(restored?.primaryOwner, false);
  rememberOfflineSession(store, key, { authenticated: true, storageConfigured: true, user: bob, role: "publisher" });
  assert.equal(offlineSessionAfterNetworkError(store, key, network)?.user?.id, "bob");
  forgetOfflineSession(store, key);
  assert.equal(offlineSessionAfterNetworkError(store, key, network), null);
  rememberOfflineSession(store, key, { authenticated: true, storageConfigured: true, user: alice, role: "peer_reviewer" });
  assert.equal(offlineSessionAfterNetworkError(store, key, network), null);
});
test("team routes round trip and review return URLs stay within the publication", () => {
  assert.equal(adminUrl({ view: "settings", settingsTab: "team" }), "/admin/settings?tab=team");
  assert.deepEqual(parseAdminRoute("/admin/reviews"), { view: "reviews" });
  assert.equal(adminEntryDestination("?next=%2Freview%2Finvitation-123"), "/review/invitation-123");
  for (const target of ["//other.test/review/a", "/review/a?redirect=https://evil.test", "/review/a#token", "/review/a/extra", "/review/../settings"]) assert.equal(adminEntryDestination(`?next=${encodeURIComponent(target)}`), "/admin");
});
