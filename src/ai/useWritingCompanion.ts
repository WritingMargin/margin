import { useEffect, useRef, useState } from "react";
import { api, json } from "../api";
import { editorialPrompts, type WritingSession } from "../../shared/writing";
import type { ContentType } from "../../shared/types";
import { sitePath } from "../base-path";
import {
  activeWritingChat,
  addWritingChat,
  migrateWritingChats,
  mergeWritingChats,
  newWritingChat,
  patchWritingChat,
  selectWritingChat,
  writingChats,
  writingChatSummaries,
  restorableWritingChats,
  type WritingChats,
  type WritingChatStore,
} from "./writing-sessions";

export function useWritingCompanion(postId: string, contentType: ContentType, enabled = true, workspace = sitePath("/admin")) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draftKeys, setDraftKeys] = useState(() =>
    initialDraftKeys(contentType, workspace),
  );
  const [sessions, setSessions] = useState<WritingChatStore>({});
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const [historyError, setHistoryError] = useState("");
  const aliases = useRef<Record<string, string>>({});
  const saveQueue = useRef<Record<string, Promise<void>>>({});
  const previousDraft = useRef<Record<string, string>>({});
  const key = postId || draftKeys[contentType];
  const currentChats = sessions[key];
  useEffect(() => {
    if (!enabled || loaded[key]) return;
    let cancelled = false;
    void api<{ chats: WritingChats | null }>(`/ai/writing/sessions/${key}`)
      .then((result) => {
        if (!cancelled) setHistoryError("");
        if (!cancelled && result.chats)
          setSessions((current) => ({
            ...current,
            [key]: mergeWritingChats(result.chats!, current[key]),
          }));
        if (!cancelled) setLoaded((current) => ({ ...current, [key]: true }));
      })
      .catch(() => {
        if (!cancelled)
          setHistoryError(
            "Chat history could not be loaded. Your current chat is still available on this page.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [key, loaded, enabled]);
  useEffect(() => {
    if (!enabled || !loaded[key] || !currentChats) return;
    const timer = window.setTimeout(() => {
      const chats = restorableWritingChats(currentChats);
      const queue = saveQueue.current;
      const oldKey = previousDraft.current[key];
      queue[key] = (queue[key] ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          if (oldKey) await queue[oldKey]?.catch(() => {});
          await api(
            `/ai/writing/sessions/${key}`,
            json("PUT", {
              chats,
              ...(postId ? { postId } : {}),
              ...(oldKey ? { previousDraftKey: oldKey } : {}),
            }),
          );
          if (oldKey) delete previousDraft.current[key];
        });
      void queue[key]
        .then(() => setHistoryError(""))
        .catch(() =>
          setHistoryError(
            "Chat history could not be saved. Keep this page open and try again when connected.",
          ),
        );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [key, loaded, currentChats, postId, enabled]);
  const chats = writingChats(sessions, key);
  const active = activeWritingChat(chats);
  const change = (patch: Partial<WritingSession>) => {
    const destination = aliases.current[key] || key;
    setSessions((current) =>
      patchWritingChat(current, destination, active.id, patch),
    );
  };
  const saved = (id: string) => {
    if (postId || key === id) return;
    aliases.current[key] = id;
    previousDraft.current[id] = key;
    setSessions((current) => migrateWritingChats(current, key, id));
    const next = crypto.randomUUID();
    rememberDraftKey(contentType, next, workspace);
    setDraftKeys((current) => ({ ...current, [contentType]: next }));
  };
  return {
    expanded,
    setExpanded,
    open,
    setOpen,
    key,
    sessionKey: active.id,
    historyError,
    chats: writingChatSummaries(chats),
    session: active.state,
    newSession: () => {
      const chat = newWritingChat(crypto.randomUUID());
      setSessions((current) =>
        addWritingChat(current, aliases.current[key] || key, chat),
      );
      setOpen(true);
    },
    selectSession: (id: string) =>
      setSessions((current) =>
        selectWritingChat(current, aliases.current[key] || key, id),
      ),
    change,
    saved,
    review: (passage: string) => {
      change({
        view: "brief",
        research: false,
        mode: "questions",
        brief: editorialPrompts.audience,
        passage,
        refine: false,
        reviewVersion: active.state.reviewVersion + 1,
      });
      setOpen(true);
    },
    newDraft: (type: ContentType) => {
      const next = crypto.randomUUID();
      rememberDraftKey(type, next, workspace);
      setDraftKeys((current) => ({ ...current, [type]: next }));
    },
  };
}

function initialDraftKeys(
  currentType: ContentType,
  workspace: string,
): Record<ContentType, string> {
  return {
    article: initialDraftKey("article", currentType === "article", workspace),
    guide: initialDraftKey("guide", currentType === "guide", workspace),
  };
}

function initialDraftKey(type: ContentType, useLegacy: boolean, workspace: string): string {
  const name = draftKeyName(type, workspace);
  try {
    const existing = localStorage.getItem(name);
    if (validDraftKey(existing)) return existing!;
  } catch {
    // Tab storage can still restore the draft when persistent storage is blocked.
  }
  try {
    const existing =
      sessionStorage.getItem(name) ||
      (useLegacy && workspace === sitePath("/admin") ? sessionStorage.getItem("margin-writing-draft-key") : null);
    if (validDraftKey(existing)) {
      rememberDraftKey(type, existing!, workspace);
      return existing!;
    }
  } catch {
    // The active chat can still use an in-memory key.
  }
  const next = crypto.randomUUID();
  rememberDraftKey(type, next, workspace);
  return next;
}

function validDraftKey(value: string | null): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function draftKeyName(type: ContentType, workspace: string): string {
  return `margin:writing-draft:${encodeURIComponent(workspace)}:${type}`;
}

function rememberDraftKey(type: ContentType, key: string, workspace: string) {
  const name = draftKeyName(type, workspace);
  try {
    localStorage.setItem(name, key);
  } catch {
    // Tab storage still keeps the chat available during this browser session.
  }
  try {
    sessionStorage.setItem(name, key);
  } catch {
    // The active chat remains available in memory when browser storage is disabled.
  }
}
