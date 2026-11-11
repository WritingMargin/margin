import type { FormattingProposal } from "./formatting";

export const writingModes = {
  ideas: { label: "Ideas", description: "Find an angle worth exploring" },
  structure: { label: "Structure", description: "Give the story a clear path" },
  opening: {
    label: "Opening notes",
    description: "Find a way into the subject",
  },
  questions: {
    label: "Questions",
    description: "Spot what needs more thought",
  },
} as const;
export type WritingMode = keyof typeof writingModes;
export type WritingView = "brief" | "notes" | "saved" | "format";
export type WritingPlan = {
  sections: { heading: string; notes: string[]; quote?: string }[];
  questions: string[];
};
export type ResearchSource = { url: string; title: string; excerpt: string };
export type ResearchContext = {
  sources: ResearchSource[];
  saved?: {
    sources: number;
    notes: number;
    sourceItems?: ResearchSource[];
    noteItems?: { id: string; title: string; body: string }[];
  };
  brief: string;
  passage: string;
};
export type WritingTurn = {
  id: string;
  message: string;
  reply?: string;
  activity?: WritingActivity;
  mode: WritingMode;
  plan: WritingPlan;
  context: WritingContext;
  contextExcerpted?: boolean;
  research?: ResearchContext;
  formatting?: FormattingProposal;
};
export type WritingActivity = {
  progress: string[];
  summary?: string;
};
export type WritingSession = {
  turns: WritingTurn[];
  pendingMessage?: string;
  pendingReply?: string;
  pendingActivity?: WritingActivity;
  research: boolean;
  researchSources: ResearchSource[];
  researchSelectionEdited?: boolean;
  researchView?: "sources" | "notes" | "notebook";
  lastResearch?: ResearchContext;
  view?: WritingView;
  mode: WritingMode;
  brief: string;
  audience: string;
  refine: boolean;
  busy: boolean;
  error: string;
  plan: WritingPlan | null;
  resultMode: WritingMode;
  passage: string;
  resultContext?: WritingContext;
  reviewVersion: number;
  followUp: string;
};
export type WritingContext = {
  brief: string;
  audience: string;
  passage: string;
  includedDraft: boolean;
  sourceRevision: string;
  feedback?: string;
};
export type WritingNote = WritingContext & {
  title: string;
  body: string;
  reason: string;
};
export type SavedWritingNote = {
  id: string;
  postId: string;
  note: WritingNote;
  createdAt: string;
};
export const editorialPrompts = {
  audience:
    "What knowledge does this text assume? For the intended audience, identify concepts that need explanation and ask focused questions about gaps in the reasoning.",
  assumptions:
    "What assumptions am I making? Identify implicit premises in this text and ask how I could examine them.",
  argument:
    "Is my argument convincing? Assess how the reasoning supports the conclusion, distinguish strengths from gaps, and ask focused questions.",
  skeptic:
    "What might a skeptical reader question? Identify the strongest reasonable objections to this text and ask how I would address them.",
  evidence:
    "What evidence would strengthen this claim? Identify specific kinds of evidence to seek and questions to investigate. Do not invent sources or citations.",
} as const;
export const emptyWritingSession: WritingSession = {
  turns: [],
  research: false,
  researchSources: [],
  mode: "ideas",
  brief: "",
  audience: "",
  refine: true,
  busy: false,
  error: "",
  plan: null,
  resultMode: "ideas",
  passage: "",
  reviewVersion: 0,
  followUp: "",
};
export function writingFollowUpSession(
  session: WritingSession,
): WritingSession {
  return {
    ...session,
    mode: session.resultMode,
    brief: session.resultContext?.brief ?? session.brief,
    audience: session.resultContext?.audience ?? session.audience,
    passage: session.resultContext?.passage ?? session.passage,
    refine: true,
  };
}
export const writingLimits = {
  title: 240,
  content: 40000,
  passage: 12000,
} as const;
const omission = "\n[…]\n";

// Include the opening and the author's latest edits without splitting Unicode
// characters or walking an entire oversized draft on each render.
export function writingExcerpt(value: string, limit: number) {
  if (value.length <= limit) return value;
  const beginning = Array.from(value.slice(0, limit * 2));
  if (value.length <= limit * 2 && beginning.length <= limit) return value;
  const retained = limit - omission.length;
  const ending = Array.from(value.slice(-limit * 2));
  return (
    beginning.slice(0, Math.ceil(retained / 2)).join("") +
    omission +
    ending.slice(-Math.floor(retained / 2)).join("")
  );
}

export function writingRequest(
  session: WritingSession,
  post: { title: string; content?: string },
  feedback = "",
) {
  return {
    mode: session.mode,
    ...(session.research ? { researchMode: true } : {}),
    brief: session.brief.trim(),
    audience: session.audience.trim(),
    title: writingExcerpt(post.title, writingLimits.title),
    content: writingExcerpt(post.content ?? "", writingLimits.content),
    ...(session.passage
      ? { passage: writingExcerpt(session.passage, writingLimits.passage) }
      : {}),
    ...(session.refine && session.plan ? { previous: session.plan } : {}),
    ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
  };
}
export function writingContext(
  session: WritingSession,
  post: { revision?: string; title?: string; content?: string },
): WritingContext {
  return {
    brief: session.brief.trim(),
    audience: session.audience.trim(),
    passage: writingExcerpt(session.passage, writingLimits.passage),
    includedDraft: Boolean(post.title || post.content),
    sourceRevision: post.revision || "",
  };
}
export function copyWritingSection(section: WritingPlan["sections"][number]) {
  const quote = section.quote
    ? `\n> ${section.quote.replaceAll("\n", "\n> ")}`
    : "";
  return `${section.heading}${quote}\n${section.notes.map((note) => `- ${note}`).join("\n")}`;
}
export function copyWritingPlan(plan: WritingPlan) {
  return [
    ...plan.sections.map(copyWritingSection),
    ...(plan.questions.length
      ? [
          `Questions to explore\n${plan.questions.map((question) => `- ${question}`).join("\n")}`,
        ]
      : []),
  ].join("\n\n");
}
