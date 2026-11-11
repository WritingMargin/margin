import assert from "node:assert/strict";
import test from "node:test";
import { editorSaveState, postSavedMessage } from "./editor/save-state";
import { visibilityChange } from "./editor/visibility-change";

test("visibility transitions distinguish unpublishing from ordinary draft saves", () => {
  const unpublish = visibilityChange("published", "draft", "post")!;
  assert.equal(unpublish.action, "Unpublish post");
  assert.match(unpublish.detail, /Still live until you unpublish/);
  assert.match(unpublish.success, /Unpublished.*private draft/);
  assert.equal(visibilityChange("draft", "draft", "post"), null);
  assert.equal(visibilityChange(undefined, "draft", "post"), null);
  assert.equal(visibilityChange("draft", "published", "guide")?.action, "Publish guide");
  assert.equal(visibilityChange("published", "archived", "post")?.action, "Archive post");
  assert.equal(visibilityChange("archived", "draft", "post")?.action, "Restore to draft");
});

test("browser backups never imply that edits are published or saved to the server", () => {
  const published = editorSaveState(true, true, true, false, "saved", true);
  assert.equal(published.label, "Unpublished changes");
  assert.match(published.detail, /Backed up in this browser/);
  assert.match(published.detail, /Publish changes/);
  const draft = editorSaveState(false, true, true, false, "saved", true);
  assert.equal(draft.label, "Unsaved draft changes");
  assert.match(draft.detail, /private revision/);
});

test("server confirmation distinguishes private drafts from live posts", () => {
  assert.equal(editorSaveState(false, true, false, false, "saved", true).label, "Draft saved");
  assert.equal(editorSaveState(true, true, false, false, "saved", true).label, "Published · Up to date");
  assert.equal(editorSaveState(true, true, true, true, "saved", true).label, "Saving…");
  assert.equal(editorSaveState(false, false, false, false, "idle", false).label, "Storage needs attention");
  assert.match(postSavedMessage(false, false), /not published/);
  assert.match(postSavedMessage(false, true), /now live/);
  assert.equal(postSavedMessage(true, false), "Published changes are live.", "keyboard save also updates a published post");
});
