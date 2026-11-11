import { useMemo, useRef } from "react";
import type { AIConfig } from "../../shared/ai";
import type { Post } from "../../shared/types";
import {
  writingExcerpt,
  writingLimits,
  type WritingActivity,
  type WritingSession,
} from "../../shared/writing";
import { streamWritingRequest } from "./writing-stream";
import {
  completedWritingTurn,
  conversationInput,
  type WritingResponse,
} from "./writing-conversation";

type Props = {
  post: Post;
  session: WritingSession;
  onChange: (patch: Partial<WritingSession>) => void;
  config: AIConfig | null;
  refresh: () => void;
  requestScope: string;
};
export function useWritingConversation({
  post,
  session,
  onChange,
  config,
  refresh,
  requestScope,
}: Props) {
  const inFlight = useRef(false);
  const content = post.content ?? "";
  const usesExcerpt = useMemo(
    () =>
      writingExcerpt(content, writingLimits.content) !== content ||
      writingExcerpt(post.title, writingLimits.title) !== post.title ||
      writingExcerpt(session.passage, writingLimits.passage) !==
        session.passage,
    [content, post.title, session.passage],
  );
  const contextTooLong =
    usesExcerpt || session.turns.at(-1)?.contextExcerpted === true;
  const disabled = session.busy || !config?.features.writing;
  async function send(text: string) {
    const message = text.trim();
    if (disabled || inFlight.current || !message) return;
    if (message.length > 4000) {
      onChange({ error: "Keep each message within 4,000 characters." });
      return;
    }
    inFlight.current = true;
    onChange({
      busy: true,
      error: "",
      pendingMessage: message,
      pendingReply: undefined,
      pendingActivity: { progress: [] },
    });
    try {
      const { request, research } = conversationInput(session, post, message);
      let reply = "";
      const activity: WritingActivity = { progress: [] };
      const result = await streamWritingRequest<WritingResponse>(
        request,
        requestScope,
        (event) => {
          if (event.event === "delta") {
            reply += event.text;
            onChange({ pendingReply: reply });
          } else if (event.event === "thinking") {
            activity.summary = (activity.summary || "") + event.text;
            onChange({
              pendingActivity: {
                ...activity,
                progress: [...activity.progress],
              },
            });
          } else if (
            event.event === "progress" &&
            event.message &&
            activity.progress.at(-1) !== event.message
          ) {
            activity.progress.push(event.message);
            onChange({
              pendingActivity: {
                ...activity,
                progress: [...activity.progress],
              },
            });
          }
        },
      );
      const turn = completedWritingTurn(
        session,
        post,
        message,
        research,
        result,
      );
      if (activity.progress.length || activity.summary)
        turn.activity = activity;
      onChange({
        turns: [...session.turns, turn],
        brief: "",
        followUp: "",
        view: "brief",
        plan: turn.plan,
        resultMode: turn.mode,
        resultContext: turn.context,
        lastResearch: turn.research,
      });
    } catch (e) {
      onChange({ error: (e as Error).message });
    } finally {
      inFlight.current = false;
      onChange({
        busy: false,
        pendingMessage: undefined,
        pendingReply: undefined,
        pendingActivity: undefined,
      });
      refresh();
    }
  }
  return { send, disabled, contextTooLong };
}
