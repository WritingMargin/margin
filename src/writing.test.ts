import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyWritingSession,
  writingExcerpt,
  writingLimits,
  writingRequest,
  copyWritingPlan,
  writingContext,
  editorialPrompts,
  writingFollowUpSession,
  type WritingPlan,
} from "../shared/writing";
const plan: WritingPlan = {
  sections: [
    {
      heading: "A possible angle",
      notes: ["Recall a moment when a small habit helped."],
    },
  ],
  questions: ["Who would benefit from this?"],
};
test("assistant sends the live title and draft on each message", () => {
  const post = {
    title: "Private title",
    content: "Unsaved draft",
    id: "post-id",
  };
  const session = { ...emptyWritingSession, brief: "  Creative habits  " };
  const input = writingRequest(session, post);
  assert.deepEqual(input, {
    mode: "ideas",
    brief: "Creative habits",
    audience: "",
    title: post.title,
    content: post.content,
  });
  assert.equal("postId" in input, false);
  assert.equal(post.content, "Unsaved draft");
});
test("follow-up includes latest notes and their original brief across view changes", () => {
  const original = {
    ...emptyWritingSession,
    brief: "Creative habits",
    audience: "New writers",
  };
  const resultContext = writingContext(original, { revision: "original" });
  const session = {
    ...original,
    plan,
    resultContext,
    refine: false,
    brief: "An unrelated new brief",
    mode: "questions" as const,
    followUp: "  Make the first suggestion more practical.  ",
    view: "saved" as const,
  };
  const returned = { ...session, view: "notes" as const };
  const input = writingRequest(
    writingFollowUpSession(returned),
    { title: "Private", content: "Private draft" },
    returned.followUp,
  );
  assert.equal(input.brief, original.brief);
  assert.equal(input.audience, original.audience);
  assert.equal(input.mode, "ideas");
  assert.deepEqual(input.previous, plan);
  assert.equal(input.feedback, "Make the first suggestion more practical.");
  assert.equal(input.content, "Private draft");
  assert.equal(input.title, "Private");
  assert.deepEqual(session.plan, plan);
  assert.equal(session.brief, "An unrelated new brief");
  assert.equal("feedback" in writingRequest(session, { title: "" }), false);
});
test("passage review includes the current draft and records only note provenance", () => {
  const post = {
    title: "Private title",
    content: "Private surrounding text",
    revision: "revision-at-review",
  };
  const session = {
    ...emptyWritingSession,
    mode: "questions" as const,
    brief: editorialPrompts.assumptions,
    passage: "The selected claim",
  };
  const input = writingRequest(session, post);
  assert.equal(input.passage, "The selected claim");
  assert.equal(input.content, post.content);
  assert.equal(input.title, post.title);
  const context = writingContext(session, post);
  post.content = "Later revision";
  post.revision = "later";
  assert.equal(context.sourceRevision, "revision-at-review");
  assert.equal(context.passage, "The selected claim");
  assert.equal(
    JSON.stringify(context).includes("Private surrounding text"),
    false,
  );
  assert.equal(writingRequest(session, post).content, "Later revision");
});
test("previous notes are optional and copying produces planning notes only", () => {
  const session = { ...emptyWritingSession, brief: "Another angle", plan };
  assert.deepEqual(writingRequest(session, { title: "" }).previous, plan);
  assert.equal(
    "previous" in writingRequest({ ...session, refine: false }, { title: "" }),
    false,
  );
  assert.equal(
    copyWritingPlan(plan),
    "A possible angle\n- Recall a moment when a small habit helped.\n\nQuestions to explore\n- Who would benefit from this?",
  );
});

test("copying suggestions includes draft quotes and omits empty question groups", () => {
  assert.equal(
    copyWritingPlan({
      sections: [
        {
          heading: "Clarify the claim",
          quote: "Readers can compare\nthe results",
          notes: ["Explain which results matter."],
        },
      ],
      questions: [],
    }),
    "Clarify the claim\n> Readers can compare\n> the results\n- Explain which results matter.",
  );
});

test("long drafts and passages retain their opening and latest edits within the Unicode limits", () => {
  const atLimit = "🦊".repeat(writingLimits.content);
  assert.equal(writingExcerpt(atLimit, writingLimits.content), atLimit);
  const post = {
    title: "T".repeat(300),
    content: "Opening" + atLimit + "Latest edit",
  };
  const passage = "First line" + "🧪".repeat(13000) + "Last line";
  const session = { ...emptyWritingSession, passage };
  const request = writingRequest(session, post);
  assert.equal(Array.from(request.title).length, writingLimits.title);
  assert.equal(Array.from(request.content).length, writingLimits.content);
  assert.ok(request.content.startsWith("Opening"));
  assert.ok(request.content.endsWith("Latest edit"));
  assert.equal(Array.from(request.passage!).length, writingLimits.passage);
  assert.ok(request.passage!.endsWith("Last line"));
  assert.equal(/\p{Surrogate}/u.test(request.content + request.passage), false);
  assert.equal(writingContext(session, post).passage, request.passage);
  assert.equal(writingContext(session, post).includedDraft, true);
});
