import ChatBody from "./ChatBody";
import ChatDock from "./ChatDock";
import { useEffect, useRef, useState } from "react";

import type { AIConfig } from "../../shared/ai";
import type { Post } from "../../shared/types";
import type {
  WritingSession,
  WritingTurn,
  WritingView,
} from "../../shared/writing";
import { api, json } from "../api";

import { ResearchLibraryProvider } from "../research/ResearchLibraryProvider";

import { formattingReplacement } from "../../shared/formatting";
import ChatSessions from "./ChatSessions";
import type { WritingChatSummary } from "./writing-sessions";
import { useWritingConversation } from "./useWritingConversation";

import { WritingViewSwitch } from "./WritingViewSwitch";
import "./assistant-panel.css";
import "./writing-chat.css";

type Props = {
  post: Post;
  session: WritingSession;
  onChange: (patch: Partial<WritingSession>) => void;
  chats: WritingChatSummary[];
  sessionId: string;
  historyError: string;
  requestScope: string;
  createSession: () => void;
  selectSession: (id: string) => void;
  changeContent: (content: string) => void;
  insert: (before: string, after?: string) => void;
  selection: () => string;
};
export default function WritingAssistant({
  post,
  session,
  onChange,
  chats,
  sessionId,
  historyError,
  requestScope,
  createSession,
  selectSession,
  changeContent,
  insert,
  selection,
}: Props) {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const keeping = useRef(false);
  const [copied, setCopied] = useState("");
  const [pane, setPane] = useState<"thread" | "library">("thread");
  const [history, setHistory] = useState(false);
  const paneView = pane === "library" && !session.research ? "thread" : pane;
  const view = session.view === "saved" ? session.view : "brief";
  const chat = view === "brief";
  const input = useRef<HTMLTextAreaElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const refresh = () => {
    setConfigError("");
    void api<AIConfig>("/ai/config")
      .then(setConfig)
      .catch((error) => setConfigError(error.message));
  };
  useEffect(refresh, []);
  const { send, disabled, contextTooLong } = useWritingConversation({
    post,
    session,
    onChange,
    config,
    refresh,
    requestScope,
  });
  const turnCount = session.turns.length;
  useEffect(() => {
    const area = scroll.current;
    if (!area) return;
    const turn = area.querySelector<HTMLElement>(".chat-turn:last-of-type");
    if (chat && paneView === "thread" && session.pendingMessage)
      area.scrollTop = area.scrollHeight;
    else if (chat && paneView === "thread" && turn)
      area.scrollTop +=
        turn.getBoundingClientRect().top -
        area.getBoundingClientRect().top -
        12;
    else area.scrollTop = 0;
  }, [
    chat,
    paneView,
    turnCount,
    session.pendingMessage,
    session.pendingReply,
    session.pendingActivity,
  ]);
  useEffect(() => {
    if (!session.reviewVersion) return;
    setPane("thread");
    const frame = requestAnimationFrame(() => {
      const area = scroll.current;
      if (area) area.scrollTop = area.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [session.reviewVersion]);
  function choose(text: string) {
    setPane("thread");
    onChange({ brief: text });
    requestAnimationFrame(() => input.current?.focus());
  }
  function refine(text: string) {
    const message = "About this suggestion: “" + text + "”";
    const next = session.brief ? message + "\n\n" + session.brief : message;
    if (next.length > 4000)
      return onChange({
        error:
          "Shorten your message before adding this suggestion (4,000 characters maximum).",
      });
    choose(next);
  }
  async function keep(turn: WritingTurn, title: string, body: string) {
    if (keeping.current) return;
    if (!post.id) {
      onChange({ error: "Save the draft to keep insights with it." });
      return;
    }
    keeping.current = true;
    const context = turn.research
      ? { brief: turn.research.brief, passage: turn.research.passage }
      : {};
    try {
      await api(
        "/posts/" + post.id + "/writing-notes",
        json("POST", {
          ...turn.context,
          ...context,
          title,
          body,
          reason: "",
        }),
      );
      onChange({ view: "saved", error: "" });
    } catch (error) {
      onChange({ error: (error as Error).message });
    } finally {
      keeping.current = false;
    }
  }
  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      onChange({
        error:
          "Clipboard access is unavailable. You can select and copy the text directly.",
      });
    }
  }
  function manage(researchView: "sources" | "notes") {
    onChange({ researchView });
    setPane("library");
  }
  function openView(next: WritingView) {
    setHistory(false);
    setPane("thread");
    onChange({ view: next });
  }
  function toggleHistory() {
    setHistory((value) => !value);
    setPane("thread");
    onChange({ view: "brief" });
  }
  function selectChat(id: string) {
    setHistory(false);
    setPane("thread");
    selectSession(id);
  }
  function updateFormatting(id: string, action: "apply" | "undo") {
    const turn = session.turns.find((item) => item.id === id);
    if (!turn?.formatting || session.busy) return;
    const proposal = { ...turn.formatting, reviewed: true };
    const replacement = formattingReplacement(
      post.content || "",
      proposal,
      action,
    );
    if (replacement === null) {
      onChange({
        error:
          "Your draft has changed. Ask again to format the latest version.",
      });
      return;
    }
    changeContent(replacement);
    onChange({
      error: "",
      turns: session.turns.map((item) =>
        item.id === id
          ? {
              ...item,
              formatting: { ...proposal, applied: action === "apply" },
            }
          : item,
      ),
    });
  }
  return (
    <ResearchLibraryProvider
      postId={post.id}
      active={session.research}
      refreshKey={session.lastResearch}
    >
      <div className="writing-assistant">
        <ChatSessions
          chats={chats}
          active={sessionId}
          history={history}
          toggle={toggleHistory}
          create={createSession}
        />
        {historyError && (
          <p className="writing-session-note" role="status">
            {historyError}
          </p>
        )}
        <WritingViewSwitch view={view} setView={openView} />
        <ChatBody
          {...{
            post,
            session,
            onChange,
            history,
            chats,
            sessionId,
            updateFormatting,
            insert,
            selection,
            chat,
            view,
            paneView,
            scroll,
            setPane,
            copied,
            manage,
            choose,
            keep,
            refine,
            copy,
          }}
          selectSession={selectChat}
        />
        {chat && !history && (
          <ChatDock
            {...{
              session,
              onChange,
              config,
              configError,
              refresh,
              contextTooLong,
              disabled,
              input,
              paneView,
              setPane,
              send,
            }}
          />
        )}
      </div>
    </ResearchLibraryProvider>
  );
}
