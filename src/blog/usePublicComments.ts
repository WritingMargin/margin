import { useEffect, useRef, useState } from "react";
import { type Comment, type Theme } from "../../shared/types";
import { api, json } from "../api";
import type { CaptchaTheme } from "../../shared/captcha";
import { useCommentAuth } from "./useCommentAuth";
import { useConversationRefresh } from "./ConversationTools";
export function usePublicComments({
  postId,
  siteKey,
  theme,
  initialComments = [],
  question,
}: {
  postId: string;
  siteKey: string;
  theme: Theme &
    CaptchaTheme & {
      commentPolicy?: import("../../shared/interactions").CommentPolicy;
    };
  initialComments?: Comment[];
  question?: { quote: string; revision: string; occurrence?: number };
}) {
  const auth = useCommentAuth();
  const { revision: conversationRevision, refresh: refreshConversation } =
    useConversationRefresh();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submission = useRef<{ payload: string; id: string } | null>(null);
  const isQuestion = Boolean(question);
  useEffect(() => {
    if (conversationRevision > 0) void auth.refresh();
  }, [conversationRevision, auth.refresh]);
  useEffect(() => {
    if (auth.reader?.name) setName(auth.reader.name);
  }, [auth.reader]);
  useEffect(() => {
    if (isQuestion) return;
    let active = true;
    api<Comment[]>(`/public/posts/${postId}/comments`)
      .then((result) => {
        if (active) setComments(result);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, [postId, isQuestion, conversationRevision]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth.reader || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const values = { postId, name: auth.reader.name || name, body, ...question };
      const payload = JSON.stringify(values);
      if (submission.current?.payload !== payload)
        submission.current = { payload, id: crypto.randomUUID() };
      const result = await api(
        `/public/posts/${postId}/${isQuestion ? "questions" : "comments"}`,
        json("POST", { ...values, submissionId: submission.current.id }),
      );
      setMessage(result.message);
      setBody("");
      submission.current = null;
      await refreshAfterSubmission(Boolean(result.pending));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshAfterSubmission(pending: boolean) {
    if (!auth.reader?.name || (isQuestion && !pending)) refreshConversation();
    if (!isQuestion && !pending) await refreshComments();
  }
  async function refreshComments() {
    try {
      setComments(await api<Comment[]>(`/public/posts/${postId}/comments`));
    } catch {
      setMessage(
        "Your contribution was accepted. Reload to see the updated conversation.",
      );
    }
  }
  function changeField(key: "name" | "email" | "body", value: string) {
    if (key === "name" && !auth.reader?.name) setName(value);
    if (key === "body") setBody(value);
  }
  return {
    auth,
    submit,
    postId,
    siteKey,
    theme,
    design: theme.comments,
    comments,
    values: { name: auth.reader?.name || name, email: "", body },
    changeField,
    message,
    busy,
  };
}
export type PublicCommentsController = ReturnType<typeof usePublicComments>;
