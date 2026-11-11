import assert from "node:assert/strict";
import test from "node:test";
import {
  commentIdentityKey,
  readCommentIdentity,
  writeCommentIdentity,
} from "./blog/comment-identity";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test("remembering stores only name and email, never the comment body or verification token", () => {
  const storage = memoryStorage();
  const draft = {
    name: "Jamie",
    email: "jamie@example.test",
    body: "Private draft",
    captchaToken: "secret",
  };
  assert.equal(writeCommentIdentity(draft, storage), true);
  assert.deepEqual(JSON.parse(storage.getItem(commentIdentityKey)!), {
    name: "Jamie",
    email: "jamie@example.test",
  });
  assert.deepEqual(readCommentIdentity(storage), {
    name: "Jamie",
    email: "jamie@example.test",
  });
});

test("forgetting removes the saved record and a fresh form has no saved identity", () => {
  const storage = memoryStorage();
  writeCommentIdentity({ name: "Jamie", email: "jamie@example.test" }, storage);
  assert.equal(writeCommentIdentity(null, storage), true);
  assert.equal(storage.getItem(commentIdentityKey), null);
  assert.equal(readCommentIdentity(storage), null);
});

test("corrupt and out-of-bounds browser records are ignored", () => {
  const storage = memoryStorage();
  for (const value of [
    "{",
    "null",
    "[]",
    '{"name":1,"email":"x"}',
    JSON.stringify({ name: "x".repeat(101), email: "x" }),
    JSON.stringify({ name: "x", email: "x".repeat(255) }),
  ]) {
    storage.setItem(commentIdentityKey, value);
    assert.equal(readCommentIdentity(storage), null);
  }
});

test("blocked browser storage does not crash or claim to have saved or forgotten details", () => {
  const denied = () => {
    throw new Error("Storage blocked");
  };
  const storage = { getItem: denied, setItem: denied, removeItem: denied };
  assert.equal(readCommentIdentity(storage), null);
  assert.equal(
    writeCommentIdentity(
      { name: "Jamie", email: "jamie@example.test" },
      storage,
    ),
    false,
  );
  assert.equal(writeCommentIdentity(null, storage), false);
  assert.equal(writeCommentIdentity(null, null), false);
});

test("server rendering has no browser storage to read", () => {
  assert.equal(readCommentIdentity(), null);
});
