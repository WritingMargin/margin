import test from "node:test";
import assert from "node:assert/strict";
import { offlineSessionAfterNetworkError, rememberOfflineSession } from "./auth/offline-session";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("only a valid previous sign-in permits offline workspace recovery", () => {
  const store = storage();
  const key = "margin:offline-session:/admin";
  rememberOfflineSession(store, key, { authenticated: true, storageConfigured: true });
  assert.deepEqual(offlineSessionAfterNetworkError(store, key, new TypeError("network unavailable")), {
    authenticated: true, setupRequired: false, storageConfigured: true,
  });
  assert.equal(offlineSessionAfterNetworkError(store, key, new Error("401 Unauthorized")), null);
  rememberOfflineSession(store, key, { authenticated: false, storageConfigured: true });
  assert.equal(offlineSessionAfterNetworkError(store, key, new TypeError("offline")), null);
});

test("malformed, incomplete, and inaccessible session markers cannot unlock offline editing", () => {
  const store = storage();
  const key = "margin:offline-session:/admin";
  for (const value of ["broken JSON", '{"authenticated":true}', '{"authenticated":false,"setupRequired":false,"storageConfigured":true}']) {
    store.setItem(key, value);
    assert.equal(offlineSessionAfterNetworkError(store, key, new TypeError("offline")), null);
  }
  store.getItem = () => { throw new Error("Storage blocked"); };
  assert.equal(offlineSessionAfterNetworkError(store, key, new TypeError("offline")), null);
});
