import {
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from "react";
import type { Post } from "../../shared/types";
export type ConflictSession = { base: Post; local: Post };
export function usePostConflicts({
  latestPost,
  setPost,
  setDirty,
  open,
  close,
  notify,
}: {
  latestPost: RefObject<Post>;
  setPost: Dispatch<SetStateAction<Post>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  open: () => void;
  close: () => void;
  notify: (message: string) => void;
}) {
  const baseline = useRef<Post | null>(null);
  const [session, setSession] = useState<ConflictSession | null>(null);
  const [undoSession, setUndo] = useState<ConflictSession | null>(null);
  function saved(post: Post) {
    baseline.current = post;
    setSession(null);
    setUndo(null);
  }
  function review() {
    if (!baseline.current || baseline.current.id !== latestPost.current.id) {
      notify(
        "Your edits are still in the editor, but the original version is unavailable for comparison.",
      );
      return;
    }
    setSession({ base: baseline.current, local: latestPost.current });
    open();
  }
  function apply(result: Post, remote: Post) {
    if (!session || latestPost.current !== session.local) {
      notify(
        "Your draft changed during review. Reopen the conflict review to include those edits.",
      );
      return;
    }
    setUndo(session);
    baseline.current = remote;
    setPost(result);
    setDirty(true);
    setSession(null);
    close();
    notify(
      "Reviewed changes are in your editor. Save when ready; nothing has been published.",
    );
  }
  function undo() {
    if (!undoSession || undoSession.local.id !== latestPost.current.id) return;
    baseline.current = undoSession.base;
    setPost(undoSession.local);
    setDirty(true);
    setUndo(null);
    notify("Your original unsaved draft is back in the editor.");
  }
  function reset() {
    baseline.current = null;
    setSession(null);
    setUndo(null);
  }
  return {
    baseline,
    session,
    review,
    apply,
    saved,
    reset,
    undo,
    canUndo: !!undoSession,
  };
}
