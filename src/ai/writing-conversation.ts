import {
  copyWritingSection,
  writingContext,
  type ResearchContext,
  type WritingPlan,
  type WritingSession,
  type WritingTurn,
} from "../../shared/writing";
import type { Post } from "../../shared/types";
import { prepareWritingRequest, researchResult } from "../research/research";

export interface WritingResponse {
  contextExcerpted?: boolean;
  reply?: string;
  plan: WritingPlan;
  researchSources?: ResearchContext["sources"];
  researchSaved?: ResearchContext["saved"];
  formatting?: { before: string; content: string; changes: number };
}

// Keep the whole transcript in the draft session. Send recent conversational text
// within the provider request budget, without copying historic editor snapshots.
function historyItem(turn: WritingTurn, session: WritingSession) {
  const notes = turn.plan.sections.map(copyWritingSection);
  const questions = turn.plan.questions.join("\n");
  const references =
    session.research && !session.researchSelectionEdited && turn.research
      ? turn.research.sources.map((s) => s.title + " — " + s.url)
      : [];
  const savedNotes = session.research
    ? (turn.research?.saved?.noteItems?.map((n) => "Saved note: " + n.title) ??
      [])
    : [];
  const response = [
    turn.reply,
    ...notes,
    questions,
    ...references,
    ...savedNotes,
  ]
    .join("\n")
    .trim();
  return {
    message: turn.message,
    response: Array.from(response).slice(0, 12000).join(""),
    research: !!turn.research,
  };
}
export function conversationInput(
  session: WritingSession,
  post: Post,
  message: string,
) {
  const current = { ...session, brief: message.trim(), refine: false };
  const { request, research } = prepareWritingRequest(
    current,
    post,
    "",
    session.turns.length > 0,
  );
  const history = session.turns
    .slice(-8)
    .map((turn) => historyItem(turn, session));
  return { request: { ...request, conversationMode: true, history }, research };
}
export function completedWritingTurn(
  session: WritingSession,
  post: Post,
  message: string,
  research: ResearchContext | undefined,
  result: WritingResponse,
): WritingTurn {
  const formatting =
    result.formatting?.before === (post.content || "")
      ? result.formatting
      : undefined;
  const reply =
    result.formatting && !formatting
      ? [
          result.reply,
          "I only received an excerpt of this draft, so I could not offer formatting for the whole article.",
        ]
          .filter(Boolean)
          .join("\n\n")
      : result.reply;
  return {
    id: crypto.randomUUID(),
    message,
    mode: session.mode,
    reply,
    plan: result.plan,
    contextExcerpted: result.contextExcerpted,
    context: writingContext({ ...session, brief: message }, post),
    ...(formatting
      ? {
          formatting: {
            before: post.content || "",
            after: formatting.content,
            changes: formatting.changes,
            applied: false,
            reviewed: false,
          },
        }
      : {}),
    research: researchResult(
      research,
      result.researchSources,
      result.researchSaved,
    ),
  };
}
