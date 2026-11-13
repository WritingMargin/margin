import assert from "node:assert/strict";
import test from "node:test";
import type { Post } from "../shared/types";
import {
  incomingPostAction,
  watchPost,
  type IncomingPost,
  type LiveConnection,
} from "./admin/post-live";
import { APIError } from "./api";
const post = (revision: string, id = "article") =>
  ({ id, revision, content: revision, title: revision }) as Post;
const flush = () => new Promise((resolve) => setImmediate(resolve));
function harness(read: (signal: AbortSignal) => Promise<Post>) {
  const listeners = new Map<string, (event: Event) => void>();
  let closed = false;
  const stream = {
    readyState: 1,
    onopen: null as EventSource["onopen"],
    onerror: null as EventSource["onerror"],
    close: () => {
      closed = true;
    },
    addEventListener: (name: string, listener: any) => {
      listeners.set(name, listener);
    },
  };
  let current = { post: post("one"), saving: false };
  const updates: IncomingPost[] = [],
    states: LiveConnection[] = [];
  let deleted = false;
  const watch = watchPost({
    id: "article",
    read,
    connect: () => stream,
    current: () => current,
    update: (value) => updates.push(value),
    connection: (value) => states.push(value),
    deleted: () => {
      deleted = true;
    },
  });
  return {
    watch,
    updates,
    states,
    current: (value: typeof current) => {
      current = value;
    },
    closed: () => closed,
    deleted: () => deleted,
    emit: (revision: string, removed = false, draftRevision?: string) =>
      listeners.get("revision")!(
        new MessageEvent("revision", {
          data: JSON.stringify({ id: "article", revision, draftRevision, deleted: removed }),
        }),
      ),
    unauthorized: () =>
      listeners.get("unauthorized")!(new Event("unauthorized")),
  };
}

test("incoming saved changes replace clean drafts, preserve unsaved edits, and defer during dialogs or saves", () => {
  const incoming = { post: post("two"), baseline: "one" };
  assert.equal(
    incomingPostAction(post("one"), incoming, false, false),
    "replace",
  );
  assert.equal(
    incomingPostAction(post("one"), incoming, true, false),
    "review",
  );
  assert.equal(incomingPostAction(post("one"), incoming, false, true), "defer");
  assert.equal(
    incomingPostAction(post("two"), incoming, true, false),
    "ignore",
  );
  assert.equal(
    incomingPostAction(post("three"), incoming, false, false),
    "ignore",
  );
  assert.equal(
    incomingPostAction(post("one", "other"), incoming, false, false),
    "ignore",
  );
});

test("initial and reconnect snapshots fetch changed revisions but skip identical revisions", async () => {
  let reads = 0;
  const h = harness(async () => {
    reads++;
    return post("two");
  });
  try {
    h.emit("one");
    await flush();
    assert.equal(reads, 0);
    h.emit("two");
    await flush();
    assert.equal(h.updates[0].post.content, "two");
    assert.equal(h.updates[0].baseline, "one");
    h.current({ post: post("two"), saving: false });
    h.emit("two");
    await flush();
    assert.equal(reads, 1);
  } finally {
    h.watch.close();
  }
});

test("an idle live connection does not poll for content", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  let reads = 0;
  const h = harness(async () => {
    reads++;
    return post("two");
  });
  try {
    h.emit("one");
    t.mock.timers.tick(120_000);
    await flush();
    assert.equal(reads, 0);
    h.emit("two");
    await flush();
    assert.equal(reads, 1);
    h.current({ post: post("two"), saving: false });
    t.mock.timers.tick(120_000);
    await flush();
    assert.equal(reads, 1);
  } finally {
    h.watch.close();
  }
});

test("in-flight responses cannot roll back a save or leak into another post", async () => {
  for (const next of [post("three"), post("one", "other")]) {
    let finish!: (post: Post) => void;
    const h = harness(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    try {
      h.emit("two");
      h.current({ post: next, saving: false });
      finish(post("two"));
      await flush();
      assert.equal(h.updates.length, 0);
    } finally {
      h.watch.close();
    }
  }
});

test("saving defers reads and closing aborts outstanding requests", async () => {
  let signal: AbortSignal | undefined;
  const h = harness(async (value) => {
    signal = value;
    return post("two");
  });
  h.current({ post: post("one"), saving: true });
  h.emit("two");
  await flush();
  assert.equal(signal, undefined);
  h.current({ post: post("one"), saving: false });
  await h.watch.refresh();
  assert.equal(h.updates.length, 1);
  h.watch.close();
  assert.ok((signal as AbortSignal | undefined)?.aborted);
  assert.ok(h.closed());
});

test("deletion and revoked authentication close the stream without replacing local content", async () => {
  const h = harness(async () => post("two"));
  try {
    h.emit("", true);
    await flush();
    assert.ok(h.deleted());
    assert.ok(h.closed());
    assert.equal(h.updates.length, 0);
  } finally {
    h.watch.close();
  }
  const revoked = harness(async () => post("two"));
  try {
    revoked.unauthorized();
    assert.equal(revoked.states.at(-1), "unauthorized");
    assert.ok(revoked.closed());
  } finally {
    revoked.watch.close();
  }
  const missing = harness(async () => {
    throw new APIError("Not found", undefined, 404);
  });
  try {
    await missing.watch.refresh(true);
    assert.ok(missing.deleted());
    assert.equal(missing.updates.length, 0);
  } finally {
    missing.watch.close();
  }
});


test("staged draft events refresh editors even when the live revision is unchanged", async () => {
  let reads = 0;
  const h = harness(async () => { reads++; return { ...post("draft-two"), baseRevision: "live" }; });
  h.current({ post: { ...post("draft-one"), baseRevision: "live" }, saving: false });
  h.emit("live", false, "draft-two");
  await flush();
  assert.equal(reads, 1);
  assert.equal(h.updates[0].post.revision, "draft-two");
  h.watch.close();
});
