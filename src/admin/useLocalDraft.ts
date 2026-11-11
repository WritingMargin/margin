import { useEffect, useRef, useState, type RefObject } from "react";
import type { Post } from "../../shared/types";
import {
  readLocalDraft,
  removeLocalDraft,
  writeLocalDraft,
} from "../../shared/local-drafts";
import { sitePath } from "../base-path";

export function useLocalDraft(
  post: Post,
  dirty: boolean,
  baseline: RefObject<Post | null>,
  notify: (message: string) => void,
) {
  const [status, setStatus] = useState<"idle" | "pending" | "saved" | "error">(
    "idle",
  );
  const latest = useRef({ post, dirty });
  latest.current = { post, dirty };
  const blocked = useRef<Post | null>(null);
  const pendingSync = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspace = sitePath("/admin");
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function flush(force = false) {
    const current = latest.current;
    if (!force && (!current.dirty || current.post === blocked.current)) return true;
    try {
      writeLocalDraft(localStorage, workspace, current.post, baseline.current, pendingSync.current);
      setStatus("saved");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }
  useEffect(() => {
    if (!dirty) {
      setStatus("idle");
      return;
    }
    setStatus("pending");
    timer.current = setTimeout(flush, 800);
    return cancel;
  }, [post, dirty]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const leaving = () => { flush(); };
    window.addEventListener("pagehide", leaving);
    window.addEventListener("beforeunload", leaving);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancel();
      flush();
      window.removeEventListener("pagehide", leaving);
      window.removeEventListener("beforeunload", leaving);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  function recover(saved: Post) {
    try {
      const local = readLocalDraft(localStorage, workspace, saved.id, saved.contentType);
      pendingSync.current = !!local?.pendingSync;
      if (local)
        notify(
          "Recovered your local draft. These edits have not been saved to the server.",
        );
      return local;
    } catch {
      setStatus("error");
      notify(
        "The browser could not read your local draft. Your saved article is open; local recovery data has been left untouched.",
      );
      return null;
    }
  }
  function discard(id: string, contentType = latest.current.post.contentType) {
    cancel();
    blocked.current = latest.current.post;
    pendingSync.current = false;
    try {
      removeLocalDraft(localStorage, workspace, id, contentType);
      setStatus("idle");
    } catch {
      setStatus("error");
      notify(
        "The browser could not clear its local draft. It may be offered again when you reopen this post.",
      );
    }
  }
  function saveLocally() {
    pendingSync.current = true;
    return flush(true);
  }
  return { status, recover, discard, flush, saveLocally, pendingSync };
}
