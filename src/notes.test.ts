import test from "node:test";
import assert from "node:assert/strict";
import { formatNoteForCopy, normalizeNoteUrl, noteBody, type WorkspaceNote } from "../shared/notes";
import { filterNotes, noteCounts, resolveSelectedNote } from "./notes/notes-view";

const note = (id: string, authorId: string, isPublic: boolean): WorkspaceNote => ({
  id, authorId, isPublic, title: id, content: "", links: [], authorName: authorId,
  authorEmail: "", canEdit: true, canDelete: true, shared: false, createdAt: "", updatedAt: "",
});
const notes = [note("private", "me", false), note("my-team-note", "me", true), note("teammate", "other", true)];

test("private and team tabs show distinct notes and matching counts", () => {
  assert.deepEqual(noteCounts(notes, "me"), { all: 3, mine: 1, team: 2 });
  assert.deepEqual(filterNotes(notes, "mine", "", "me").map(n => n.id), ["private"]);
  assert.deepEqual(filterNotes(notes, "team", "", "me").map(n => n.id), ["my-team-note", "teammate"]);
});

test("filtering never keeps an excluded note in the editor", () => {
  const team = filterNotes(notes, "team", "", "me");
  assert.equal(resolveSelectedNote(team, "private")?.id, "my-team-note");
  assert.equal(resolveSelectedNote(team, "teammate")?.id, "teammate");
  assert.equal(resolveSelectedNote(filterNotes(notes, "team", "missing", "me"), "private"), null);
  assert.equal(resolveSelectedNote([], "private"), null);
});

test("old saved links become inline Markdown and remain in copied notes", () => {
  const legacy = { title: "Research", content: "Original paragraph.", links: [{ title: "Study [2026]", url: "https://example.com/study_(1)" }] };
  assert.equal(noteBody(legacy), "Original paragraph.\n\n[Study \\[2026\\]](<https://example.com/study_(1)>)");
  assert.equal(formatNoteForCopy(legacy), "# Research\n\n" + noteBody(legacy));
  assert.equal(noteBody({ content: noteBody(legacy), links: [] }), noteBody(legacy));
});

test("invalid or unsafe URLs are rejected before they reach note saving", () => {
  for (const url of ["not a url", "https://not%20a%20url/", "http://", "javascript:alert(1)", "data:text/html,test", "ftp://example.com"]) {
    assert.equal(normalizeNoteUrl(url), "", url);
  }
  assert.equal(normalizeNoteUrl("example.com/research"), "https://example.com/research");
  assert.equal(normalizeNoteUrl(" https://example.com/a%20b "), "https://example.com/a%20b");
});
