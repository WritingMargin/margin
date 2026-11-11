import { useEffect, useRef, useState } from "react";
import type { Post } from "../../shared/types";
import {
  incomingPostAction,
  watchPost,
  type IncomingPost,
  type LiveConnection,
} from "./post-live";

type Options = {
  post: Post;
  enabled: boolean;
  dirty: boolean;
  busy: boolean;
  blocked: boolean;
  apply: (post: Post) => boolean;
  refreshPosts: () => void;
};
export function useLivePost(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const watcher = useRef<ReturnType<typeof watchPost> | null>(null);
  const [incoming, setIncoming] = useState<IncomingPost | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [connection, setConnection] = useState<LiveConnection>("connecting");
  const id = options.enabled ? options.post.id : "";
  useEffect(() => {
    setIncoming(null);
    setDeleted(false);
    setConnection("connecting");
    if (!id) return;
    let lastSeen = "";
    const live = watchPost({
      id,
      current: () => ({
        post: latest.current.post,
        saving: latest.current.busy,
      }),
      update: (value) => {
        setIncoming(value);
        if (
          value.post.revision !== latest.current.post.revision &&
          value.post.revision !== lastSeen
        )
          latest.current.refreshPosts();
        lastSeen = value.post.revision || "";
      },
      deleted: () => {
        setDeleted(true);
        setIncoming(null);
        latest.current.refreshPosts();
      },
      connection: setConnection,
    });
    watcher.current = live;
    const visible = () => {
      if (document.visibilityState === "visible") void live.refresh(true);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      live.close();
      watcher.current = null;
      document.removeEventListener("visibilitychange", visible);
    };
  }, [id]);
  useEffect(() => {
    if (!options.busy) void watcher.current?.refresh();
  }, [options.busy, options.post.revision]);
  const action = incoming
    ? incomingPostAction(
        options.post,
        incoming,
        options.dirty,
        options.busy || options.blocked,
      )
    : "ignore";
  useEffect(() => {
    if (!incoming || action !== "replace") return;
    if (latest.current.apply(incoming.post)) setIncoming(null);
  }, [incoming, action]);
  return {
    pending: action === "review" || action === "defer",
    deleted,
    connection,
  };
}
