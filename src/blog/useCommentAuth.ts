import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, json } from "../api";
export type CommentReader = { name: string; provider: string };
function useLocalCommentAuth(enabled: boolean) {
  const [reader, setReader] = useState<CommentReader | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await api<{
        reader: CommentReader | null;
        providers: string[];
      }>("/public/comment-auth");
      setReader(data.reader);
      setProviders(data.providers);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function signIn(provider: string, email = "", returnPath?: string) {
    setBusy(true);
    setMessage("");
    try {
      const returnTo = returnPath ?? location.pathname + location.search;
      if (provider === "email") {
        const result = await api<{ message: string }>(
          "/public/comment-auth/email",
          json("POST", { email, returnTo }),
        );
        setMessage(result.message);
      } else {
        const result = await api<{ url: string }>(
          "/public/comment-auth/start",
          json("POST", { provider, returnTo }),
        );
        location.assign(result.url);
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setMessage("");
    try {
      await api("/public/comment-auth/logout", json("POST", {}));
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return {
    reader,
    providers,
    loading,
    busy,
    message,
    refresh,
    signIn,
    signOut,
  };
}
export type CommentAuth = ReturnType<typeof useLocalCommentAuth>;
const ReaderAuthContext = createContext<CommentAuth | null>(null);
export function ReaderAuthProvider({ children }: { children: ReactNode }) {
  const auth = useLocalCommentAuth(true);
  return createElement(ReaderAuthContext.Provider, { value: auth }, children);
}
export function useCommentAuth(): CommentAuth {
  const shared = useContext(ReaderAuthContext);
  const local = useLocalCommentAuth(shared === null);
  return shared ?? local;
}
