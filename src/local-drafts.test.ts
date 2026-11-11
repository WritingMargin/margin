import test from "node:test";
import assert from "node:assert/strict";
import {
  readLocalDraft,
  writeLocalDraft,
  removeLocalDraft,
  localDraftKey,
  listPendingDrafts,
  cacheSavedPost,
  readCachedPost,
  recoverOfflinePost,
  cachedPostKey,
  type DraftStorage,
} from "../shared/local-drafts";
import type { Post } from "../shared/types";
const base: Post = {
  id: "post-1",
  revision: "reviewed-revision",
  title: "Original",
  content: "Original body",
  slug: "original",
  excerpt: "",
  status: "draft",
  tags: [],
  cover: "",
  seo: { title: "", description: "", image: "" },
  createdAt: "2026-10-14",
  updatedAt: "2026-10-14",
};
function storage(): DraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
test("local recovery preserves unsaved content, settings and the reviewed baseline", () => {
  const store = storage();
  const local = {
    ...base,
    title: "Unsaved",
    contentType: "guide" as const,
    featured: true,
    tableOfContents: "right" as const,
    content: "My unsaved body",
    seo: { ...base.seo, description: "Unsaved search description" },
  };
  writeLocalDraft(store, "/blog/admin", local, base);
  const recovered = readLocalDraft(store, "/blog/admin", base.id)!;
  assert.deepEqual(recovered.post, local);
  assert.deepEqual(recovered.baseline, base);
  assert.equal(recovered.post.revision, "reviewed-revision");
});
test("new drafts are recoverable and mounted workspaces and article IDs stay separate", () => {
  const store = storage();
  writeLocalDraft(
    store,
    "/blog/admin",
    { ...base, id: "", revision: undefined },
    null,
  );
  assert.equal(
    readLocalDraft(store, "/blog/admin", "")?.post.title,
    "Original",
  );
  assert.equal(readLocalDraft(store, "/another/admin", ""), null);
  assert.equal(readLocalDraft(store, "/blog/admin", base.id), null);
});
test("successful saves and explicit discard can clear only the relevant local draft", () => {
  const store = storage();
  writeLocalDraft(store, "/admin", base, base);
  writeLocalDraft(
    store,
    "/admin",
    { ...base, id: "other" },
    { ...base, id: "other" },
  );
  removeLocalDraft(store, "/admin", base.id);
  assert.equal(readLocalDraft(store, "/admin", base.id), null);
  assert.equal(readLocalDraft(store, "/admin", "other")?.post.id, "other");
});
test("invalid records and mismatched conflict baselines are rejected without deleting data", () => {
  const store = storage();
  const key = localDraftKey("/admin", base.id);
  store.setItem(key, "broken JSON");
  assert.throws(() => readLocalDraft(store, "/admin", base.id));
  assert.equal(store.getItem(key), "broken JSON");
  writeLocalDraft(store, "/admin", base, { ...base, revision: "different" });
  assert.throws(() => readLocalDraft(store, "/admin", base.id), /baseline/);
});
test("quota errors propagate so the UI cannot report a successful local save", () => {
  const store = storage();
  store.setItem = () => {
    throw new Error("Quota exceeded");
  };
  assert.throws(() => writeLocalDraft(store, "/admin", base, base), /Quota/);
});

test("a locally saved draft retains its pending sync marker through recovery", () => {
  const store = storage();
  writeLocalDraft(store, "/admin", { ...base, content: "Offline words" }, base, true);
  const recovered = readLocalDraft(store, "/admin", base.id);
  assert.equal(recovered?.pendingSync, true);
  assert.equal(recovered?.post.content, "Offline words");
});

test("pending drafts can be found after reopening the workspace", () => {
  const values = new Map<string, string>();
  const store = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  writeLocalDraft(store, "/admin", { ...base, id: "", revision: undefined, title: "Offline article" }, null, true);
  writeLocalDraft(store, "/admin", base, base);
  assert.deepEqual(listPendingDrafts(store, "/admin").map(item => item.post.title), ["Offline article"]);
});

test("an opened server article can be restored when the API is offline", () => {
  const store = storage();
  cacheSavedPost(store, "/admin", base);
  assert.deepEqual(readCachedPost(store, "/admin", base.id), base);
  assert.equal(readCachedPost(store, "/admin", "another"), null);
});

test("damaged or unrelated server snapshots do not hide a valid local draft", () => {
  const store = storage();
  const local = { ...base, content: "Unsynced paragraph" };
  writeLocalDraft(store, "/admin", local, base, true);
  store.setItem(cachedPostKey("/admin"), "damaged JSON");
  assert.deepEqual(recoverOfflinePost(store, "/admin", base.id), base);
  cacheSavedPost(store, "/admin", { ...base, id: "another" });
  assert.deepEqual(recoverOfflinePost(store, "/admin", base.id), base);
  assert.equal(recoverOfflinePost(store, "/other/admin", base.id), null);
  assert.equal(readLocalDraft(store, "/admin", base.id)?.post.content, "Unsynced paragraph");
});

test("a failed server snapshot cache write frees its old copy for local drafts", () => {
  const values = new Map<string, string>();
  let failSnapshot = false;
  const store: DraftStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failSnapshot && key.startsWith("margin:cached-post:")) throw new Error("Quota exceeded");
      values.set(key, value);
    },
    removeItem: key => { values.delete(key); },
  };
  cacheSavedPost(store, "/admin", base);
  failSnapshot = true;
  assert.throws(() => cacheSavedPost(store, "/admin", { ...base, content: "A much larger article" }), /Quota/);
  assert.equal(readCachedPost(store, "/admin", base.id), null);
  writeLocalDraft(store, "/admin", { ...base, id: "", revision: undefined }, null, true);
  assert.equal(readLocalDraft(store, "/admin", "")?.pendingSync, true);
});

test("new article and guide backups recover independently", () => {
  const store = storage();
  for (const contentType of ["article", "guide"] as const) {
    writeLocalDraft(store, "/admin", { ...base, id: "", revision: undefined, contentType, title: contentType }, null);
  }
  removeLocalDraft(store, "/admin", "", "guide");
  assert.equal(readLocalDraft(store, "/admin", "", "guide"), null);
  assert.equal(readLocalDraft(store, "/admin", "")?.post.title, "article");
});


test("retired doc backups recover as articles without losing content or overwriting another draft", () => {
  const store = storage();
  const articleKey = localDraftKey("/admin", "");
  const legacyKey = `${articleKey}:doc`;
  const legacy = { version: 1, savedAt: "then", post: { ...base, id: "", revision: undefined, contentType: "doc", content: "Reference notes" }, baseline: null };
  store.setItem(legacyKey, JSON.stringify(legacy));
  writeLocalDraft(store, "/admin", { ...base, id: "", revision: undefined, content: "Article draft" }, null);
  assert.equal(readLocalDraft(store, "/admin", "")?.post.content, "Article draft");
  assert.notEqual(store.getItem(legacyKey), null);
  removeLocalDraft(store, "/admin", "");
  const recovered = readLocalDraft(store, "/admin", "")!;
  assert.equal(recovered.post.contentType, "article");
  assert.equal(recovered.post.content, "Reference notes");
  assert.equal(store.getItem(legacyKey), null);
  assert.equal(readLocalDraft(store, "/admin", "")?.post.content, "Reference notes");

  store.setItem(localDraftKey("/admin", base.id), JSON.stringify({ ...legacy, post: { ...base, contentType: "doc" }, baseline: { ...base, contentType: "doc" } }));
  assert.equal(readLocalDraft(store, "/admin", base.id)?.post.contentType, "article");
  assert.equal(readLocalDraft(store, "/admin", base.id)?.baseline?.contentType, "article");
});
