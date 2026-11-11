import { emptyWritingSession, type WritingSession } from "../../shared/writing";

export type WritingChat = {
  id: string;
  createdAt: number;
  state: WritingSession;
};
export type WritingChats = { active: string; items: WritingChat[] };
export type WritingChatSummary = { id: string; title: string; busy: boolean };
export type WritingChatStore = Record<string, WritingChats>;

export function restorableWritingChats(chats: WritingChats): WritingChats {
  return {
    active: chats.active,
    items: chats.items.map((chat) => ({
      ...chat,
      state: {
        ...chat.state,
        busy: false,
        error: "",
        pendingMessage: undefined,
        pendingReply: undefined,
        pendingActivity: undefined,
      },
    })),
  };
}

export function mergeWritingChats(
  remote: WritingChats,
  local?: WritingChats,
): WritingChats {
  if (!local) return restorableWritingChats(remote);
  const items = remote.items.map((chat) => {
    const edited = local.items.find((item) => item.id === chat.id);
    if (!edited) return chat;
    return {
      ...chat,
      state: {
        ...chat.state,
        ...edited.state,
        turns: edited.state.turns.length
          ? edited.state.turns
          : chat.state.turns,
      },
    };
  });
  for (const chat of local.items) {
    if (!items.some((item) => item.id === chat.id)) items.push(chat);
  }
  return restorableWritingChats({ active: local.active, items });
}

export function newWritingChat(
  id: string,
  createdAt = Date.now(),
): WritingChat {
  return {
    id,
    createdAt,
    state: { ...emptyWritingSession, turns: [], researchSources: [] },
  };
}
export function writingChats(
  store: WritingChatStore,
  key: string,
): WritingChats {
  return (
    store[key] ?? { active: "initial", items: [newWritingChat("initial", 0)] }
  );
}
export function activeWritingChat(chats: WritingChats) {
  return chats.items.find((chat) => chat.id === chats.active) ?? chats.items[0];
}
export function patchWritingChat(
  store: WritingChatStore,
  key: string,
  id: string,
  patch: Partial<WritingSession>,
): WritingChatStore {
  const chats = writingChats(store, key);
  return {
    ...store,
    [key]: {
      ...chats,
      items: chats.items.map((chat) =>
        chat.id === id ? { ...chat, state: { ...chat.state, ...patch } } : chat,
      ),
    },
  };
}
export function addWritingChat(
  store: WritingChatStore,
  key: string,
  chat: WritingChat,
): WritingChatStore {
  const chats = writingChats(store, key);
  return {
    ...store,
    [key]: { active: chat.id, items: [...chats.items, chat] },
  };
}
export function selectWritingChat(
  store: WritingChatStore,
  key: string,
  id: string,
): WritingChatStore {
  const chats = writingChats(store, key);
  if (!chats.items.some((chat) => chat.id === id)) return store;
  return {
    ...store,
    [key]: {
      ...chats,
      active: id,
      items: chats.items.map((chat) =>
        chat.id === id
          ? { ...chat, state: { ...chat.state, view: "brief" } }
          : chat,
      ),
    },
  };
}
export function migrateWritingChats(
  store: WritingChatStore,
  from: string,
  to: string,
): WritingChatStore {
  if (from === to) return store;
  const next = { ...store, [to]: writingChats(store, from) };
  delete next[from];
  return next;
}
export function writingChatSummaries(
  chats: WritingChats,
): WritingChatSummary[] {
  return chats.items
    .map((chat, index) => ({
      id: chat.id,
      title: chatTitle(chat.state, index),
      busy: chat.state.busy,
    }))
    .reverse();
}
function chatTitle(session: WritingSession, index: number) {
  const message =
    session.turns[0]?.message || session.pendingMessage || session.brief;
  if (!message.trim()) return `Chat ${index + 1}`;
  const words = message.trim().split(/\s+/);
  return words.slice(0, 8).join(" ") + (words.length > 8 ? "…" : "");
}
