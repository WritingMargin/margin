import assert from "node:assert/strict";
import test from "node:test";
import {
  activeWritingChat,
  addWritingChat,
  migrateWritingChats,
  mergeWritingChats,
  newWritingChat,
  patchWritingChat,
  selectWritingChat,
  restorableWritingChats,
  writingChats,
} from "./ai/writing-sessions";

test("switching chats preserves independent messages and context", () => {
  let store = patchWritingChat({}, "draft", "initial", {
    brief: "First unsent message",
    audience: "Gardeners",
    research: true,
  });
  store = addWritingChat(store, "draft", newWritingChat("second", 2));
  store = patchWritingChat(store, "draft", "second", {
    brief: "A separate question",
    audience: "Researchers",
  });
  store = selectWritingChat(store, "draft", "initial");
  assert.equal(
    activeWritingChat(writingChats(store, "draft")).state.brief,
    "First unsent message",
  );
  assert.equal(
    activeWritingChat(writingChats(store, "draft")).state.research,
    true,
  );
  store = selectWritingChat(store, "draft", "second");
  assert.equal(
    activeWritingChat(writingChats(store, "draft")).state.audience,
    "Researchers",
  );
});
test("restored chats keep completed turns and clear interrupted streaming state", () => {
  const remote = {
    active: "initial",
    items: [
      {
        ...newWritingChat("initial", 1),
        state: {
          ...newWritingChat("initial", 1).state,
          turns: [
            {
              id: "turn",
              message: "Hi",
              mode: "ideas" as const,
              plan: { sections: [], questions: [] },
              context: {
                brief: "Hi",
                audience: "",
                passage: "",
                includedDraft: false,
                sourceRevision: "",
              },
            },
          ],
          busy: true,
          pendingReply: "Half a reply",
        },
      },
    ],
  };
  const restored = restorableWritingChats(remote);
  assert.equal(restored.items[0].state.busy, false);
  assert.equal(restored.items[0].state.pendingReply, undefined);
  assert.equal(restored.items[0].state.turns[0].message, "Hi");
  const local = patchWritingChat({}, "draft", "initial", {
    brief: "New unsent thought",
  }).draft;
  const merged = mergeWritingChats(remote, local);
  assert.equal(merged.items[0].state.brief, "New unsent thought");
  assert.equal(merged.items[0].state.turns[0].message, "Hi");
});
test("a background reply updates its original chat without switching the active chat", () => {
  let store = patchWritingChat({}, "draft", "initial", {
    busy: true,
    pendingMessage: "Original request",
  });
  store = addWritingChat(store, "draft", newWritingChat("second", 2));
  store = patchWritingChat(store, "draft", "second", {
    brief: "Keep typing here",
  });
  store = patchWritingChat(store, "draft", "initial", {
    busy: false,
    pendingMessage: undefined,
    error: "Original request failed",
  });
  const chats = writingChats(store, "draft");
  assert.equal(chats.active, "second");
  assert.equal(activeWritingChat(chats).state.brief, "Keep typing here");
  assert.equal(chats.items[0].state.error, "Original request failed");
});
test("saving a new draft migrates all chats and keeps background updates isolated", () => {
  let store = patchWritingChat({}, "unsaved", "initial", {
    brief: "First chat",
  });
  store = addWritingChat(store, "unsaved", newWritingChat("second", 2));
  store = migrateWritingChats(store, "unsaved", "saved-post");
  store = patchWritingChat(store, "saved-post", "initial", {
    brief: "Completed after save",
  });
  assert.equal(store.unsaved, undefined);
  assert.equal(store["saved-post"].active, "second");
  assert.equal(store["saved-post"].items.length, 2);
  assert.equal(
    store["saved-post"].items[0].state.brief,
    "Completed after save",
  );
  assert.equal(writingChats(store, "another-post").items[0].state.brief, "");
});
