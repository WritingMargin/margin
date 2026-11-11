import type { Theme } from "./types";

export type InteractionSettings = {
  enabled: boolean;
  editPolicy: "keep" | "hide";
};
export type PassageQuestion = {
  id: string;
  name: string;
  body: string;
  quote: string;
  answer: string;
  anchor_status: "active" | "detached" | "earlier";
  section_anchor_status?: "active" | "earlier";
  position?: number;
  occurrence?: number;
  createdAt: string;
  followups?: PassageFollowup[];
  canReply?: boolean;
};
export type PassageFollowup = {
  id: string;
  body: string;
  answer: string;
  approved: boolean;
  createdAt: string;
};
export type PassageReaction = {
  quote: string;
  emoji: string;
  count: number;
  anchor_status: "active" | "earlier";
  position?: number;
  occurrence?: number;
};
export type ReaderNote = {
  id: string;
  quote: string;
  body: string;
  revision: string;
  anchor_status?: "active" | "earlier";
};
export type InteractionData = {
  enabled: boolean;
  questionMode: "open" | "closed" | "hidden";
  notesEnabled: boolean;
  subscriber: boolean;
  questions: PassageQuestion[];
  reactionsEnabled?: boolean;
  reactions?: PassageReaction[];
  authorUpdate?: { id: string; body: string; revision: string; createdAt: string; updatedAt: string } | null;
  contributors?: { id: string; name: string; quote: string; position: number; revision: string }[];
};
export type ConversationMode = "open" | "closed" | "hidden";
export type CommentPolicy = {
  requireSignIn?: boolean;
  requireEmailVerification: boolean;
  requireApproval: boolean;
};
export type ReaderPreferences = CommentPolicy & {
  newsletter: boolean;
  comments: ConversationMode;
  notes: boolean;
  editPolicy: "keep" | "hide";
};

export function commentsOpen(
  theme: Pick<Theme, "comments">,
  _siteKey?: string,
): boolean {
  return theme.comments.visible && theme.comments.enabled;
}

export function availableInteractions(
  data: InteractionData,
  theme: Pick<Theme, "comments"> & { captchaSiteKey?: string },
): InteractionData {
  if (commentsOpen(theme, theme.captchaSiteKey) && data.questionMode === "open")
    return data;
  return {
    ...data,
    questionMode: "hidden",
    questions: [],
    enabled: data.notesEnabled || !!data.reactionsEnabled,
  };
}

export function canAnnotate(data: InteractionData): boolean {
  return data.questionMode === "open" || data.notesEnabled || !!data.reactionsEnabled;
}
