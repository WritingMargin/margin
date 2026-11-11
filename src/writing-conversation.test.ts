import test from "node:test";
import assert from "node:assert/strict";
import type { Post } from "../shared/types";
import { emptyWritingSession } from "../shared/writing";
import {
  conversationInput,
  completedWritingTurn,
} from "./ai/writing-conversation";

const draft = {
  id: "draft",
  title: "Private title",
  content: "Private body",
  revision: "r1",
} as Post;
const found = {
  url: "https://doi.org/10.1234/example",
  title: "Study",
  excerpt: "Abstract.",
};
const answer = {
  reply: "Compare evidence quality.",
  plan: {
    sections: [{ heading: "Sample", notes: ["Examine recruitment."] }],
    questions: [],
  },
  researchSources: [found],
  researchSaved: {
    sources: 1,
    notes: 1,
    sourceItems: [found],
    noteItems: [
      { id: "note", title: "Limits", body: "Sample size was small." },
    ],
  },
};
test("follow-ups carry the author's conversation, preserving current context choices", () => {
  const session = {
    ...emptyWritingSession,
    brief: "Find evidence about insomnia",
    passage: "Private passage",
    research: true,
  };
  const first = conversationInput(session, draft, session.brief);
  assert.equal(first.request.content, draft.content);
  assert.equal(first.request.postId, draft.id);
  const turn = completedWritingTurn(
    session,
    draft,
    session.brief,
    first.research,
    answer,
  );
  assert.deepEqual(turn.research?.saved?.sourceItems, [found]);
  const current = {
    ...session,
    turns: [turn],
    lastResearch: turn.research,
    plan: turn.plan,
    passage: "",
    research: false,
    mode: "questions" as const,
  };
  const edits = {
    ...draft,
    title: "Revised title",
    content: "A new unsaved paragraph",
  };
  const { request } = conversationInput(current, edits, "Which sample?");
  assert.equal(request.title, edits.title);
  assert.equal(request.content, edits.content);
  assert.equal(request.brief, "Which sample?");
  assert.equal(request.mode, "questions");
  assert.equal(request.history[0].message, session.brief);
  assert.match(request.history[0].response, /Compare evidence quality/);
  assert.match(request.history[0].response, /Examine recruitment/);
  assert.doesNotMatch(
    JSON.stringify(request),
    /Private|postId|researchSources|doi\.org|Sample size was small|"previous"/,
  );
  const enabled = conversationInput(
    { ...current, research: true },
    draft,
    "Save the study",
  );
  assert.deepEqual(enabled.research?.sources, [found]);
  const cleared = conversationInput(
    { ...current, research: true, researchSelectionEdited: true },
    draft,
    "What else?",
  );
  assert.deepEqual(cleared.research?.sources, []);
  assert.doesNotMatch(
    JSON.stringify(cleared.request.history),
    /doi\.org|Private/,
  );
  assert.equal(cleared.request.content, draft.content);
});
test("chat sends only eight most recent complete turns, and unsaved drafts cannot save research", () => {
  const talk = { ...emptyWritingSession, research: true };
  const post = { ...draft, id: "" };
  const turns = Array.from({ length: 10 }, (_, i) =>
    completedWritingTurn(talk, post, "Message " + i, undefined, {
      plan: answer.plan,
    }),
  );
  const { request } = conversationInput({ ...talk, turns }, post, "Continue");
  assert.equal("postId" in request, false);
  assert.deepEqual(
    request.history.map((t) => t.message),
    turns.slice(2).map((t) => t.message),
  );
  assert.match(request.history[0].response, /Examine recruitment/);
});

test("a long author message still includes selected research sources through the structured attachment", () => {
  const session = {
    ...emptyWritingSession,
    research: true,
    researchSources: [found],
  };
  const message = "A".repeat(4000);
  const { request } = conversationInput(session, draft, message);
  assert.equal(request.brief, message);
  assert.equal(request.content, draft.content);
  if (!("researchSources" in request))
    assert.fail("selected research sources were omitted");
  assert.deepEqual(request.researchSources, [found]);
});

test("chat formatting belongs to the complete editor snapshot, never a truncated excerpt", () => {
  const formatting = {
    before: draft.content || "",
    content: "**" + draft.content + "**",
    changes: 1,
  };
  const turn = completedWritingTurn(
    emptyWritingSession,
    draft,
    "Format this",
    undefined,
    { ...answer, formatting },
  );
  assert.equal(turn.formatting?.before, draft.content);
  assert.equal(turn.formatting?.after, formatting.content);
  assert.equal(turn.formatting?.applied, false);
  const excerpt = completedWritingTurn(
    emptyWritingSession,
    draft,
    "Format this",
    undefined,
    {
      ...answer,
      formatting: { ...formatting, before: "Private", content: "**Private**" },
    },
  );
  assert.equal(excerpt.formatting, undefined);
  assert.match(excerpt.reply!, /excerpt/);
});
