import type { RefObject } from "react";
import type { AIConfig } from "../../shared/ai";
import type { Post } from "../../shared/types";
import type {
  WritingSession,
  WritingTurn,
  WritingView,
} from "../../shared/writing";
import type { WritingChatSummary } from "./writing-sessions";
export type ChatPane = "thread" | "library";
export type AssistantInput = {
  post: Post;
  session: WritingSession;
  onChange: (patch: Partial<WritingSession>) => void;
  insert: (before: string, after?: string) => void;
  selection: () => string;
};
export type ChatBodyProps = AssistantInput & {
  history: boolean;
  chats: WritingChatSummary[];
  sessionId: string;
  selectSession: (id: string) => void;
  updateFormatting: (id: string, action: "apply" | "undo") => void;
  chat: boolean;
  view: WritingView;
  paneView: ChatPane;
  scroll: RefObject<HTMLDivElement | null>;
  setPane: (pane: ChatPane) => void;
  copied: string;
  manage: (view: "sources" | "notes") => void;
  choose: (text: string) => void;
  keep: (turn: WritingTurn, title: string, body: string) => void;
  refine: (text: string) => void;
  copy: (text: string, id: string) => void;
};
export type ChatDockProps = Pick<AssistantInput, "session" | "onChange"> & {
  config: AIConfig | null;
  configError: string;
  refresh: () => void;
  contextTooLong: boolean;
  disabled: boolean;
  input: RefObject<HTMLTextAreaElement | null>;
  paneView: ChatPane;
  setPane: (pane: ChatPane) => void;
  send: (text: string) => void;
};
