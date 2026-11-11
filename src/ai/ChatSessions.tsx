import {
  Check,
  ChevronDown,
  Loader2,
  MessagesSquare,
  Plus,
} from "lucide-react";
import type { WritingChatSummary } from "./writing-sessions";
import "./chat-sessions.css";

type Props = {
  chats: WritingChatSummary[];
  active: string;
  history: boolean;
  toggle: () => void;
  create: () => void;
};
export default function ChatSessions({
  chats,
  active,
  history,
  toggle,
  create,
}: Props) {
  const current = chats.find((chat) => chat.id === active);
  return (
    <div className="chat-sessions-bar">
      <button
        type="button"
        className="chat-session-trigger chat-context-trigger"
        aria-label="Switch chat"
        aria-expanded={history}
        onClick={toggle}
      >
        <MessagesSquare size={13} aria-hidden="true" />
        <span>{current?.title || "New chat"}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="chat-new-session chat-tool"
        aria-label="New chat"
        title="New chat"
        onClick={create}
      >
        <Plus size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
export function ChatSessionList({
  chats,
  active,
  select,
}: {
  chats: WritingChatSummary[];
  active: string;
  select: (id: string) => void;
}) {
  return (
    <section className="chat-session-history" aria-label="Chats">
      <h3>Your chats</h3>
      <p>
        Chats in this workspace are kept for 24 hours after your last change.
      </p>
      <div className="chat-session-list">
        {chats.map((chat) => (
          <button
            type="button"
            key={chat.id}
            aria-current={chat.id === active ? "true" : undefined}
            onClick={() => select(chat.id)}
          >
            <MessagesSquare size={14} aria-hidden="true" />
            <span>{chat.title}</span>
            {chat.busy ? (
              <Loader2
                size={13}
                className="spin"
                aria-label="Reply in progress"
              />
            ) : (
              chat.id === active && <Check size={13} aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
