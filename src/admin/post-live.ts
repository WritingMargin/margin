import type { Post } from "../../shared/types";
import { api, APIError } from "../api";
import { sitePath } from "../base-path";

export type IncomingPost = { post: Post; baseline: string | undefined };
export type LiveConnection =
  "connecting" | "connected" | "reconnecting" | "unauthorized";
export function incomingPostAction(
  local: Post,
  incoming: IncomingPost,
  dirty: boolean,
  blocked: boolean,
) {
  if (
    local.id !== incoming.post.id ||
    local.revision === incoming.post.revision ||
    local.revision !== incoming.baseline
  )
    return "ignore";
  if (dirty) return "review";
  return blocked ? "defer" : "replace";
}

type Stream = Pick<
  EventSource,
  "onopen" | "onerror" | "addEventListener" | "close" | "readyState"
>;
type Options = {
  id: string;
  current: () => { post: Post; saving: boolean };
  update: (incoming: IncomingPost) => void;
  deleted: () => void;
  connection: (state: LiveConnection) => void;
  read?: (signal: AbortSignal) => Promise<Post>;
  connect?: (url: string) => Stream;
};
export function watchPost(options: Options) {
  const path = `/posts/${encodeURIComponent(options.id)}`;
  const stream = (options.connect || ((url) => new EventSource(url)))(
    sitePath(`/api${path}/events`),
  );
  const read = options.read || ((signal) => api<Post>(path, { signal }));
  const controller = new AbortController();
  let wanted = "",
    reading = false,
    pending = false,
    stopped = false;
  function status(value: LiveConnection) {
    options.connection(value);
  }
  function deleted() {
    stopped = true;
    stream.close();
    options.deleted();
  }
  function failure(error: unknown) {
    if (controller.signal.aborted) return;
    if (error instanceof APIError && error.status === 404) return deleted();
    if (error instanceof APIError && error.status === 401) {
      stopped = true;
      stream.close();
      status("unauthorized");
    } else status("reconnecting");
  }
  function deliver(post: Post, baseline: string | undefined) {
    const latest = options.current();
    if (
      !controller.signal.aborted &&
      !stopped &&
      latest.post.id === options.id &&
      latest.post.revision === baseline
    )
      options.update({ post, baseline });
  }
  function canRead(current: ReturnType<Options["current"]>, force: boolean) {
    return (
      !current.saving &&
      current.post.id === options.id &&
      (force || (!!wanted && wanted !== current.post.revision))
    );
  }
  async function refresh(force = false) {
    if (stopped) return;
    if (reading) {
      pending = true;
      return;
    }
    const current = options.current();
    if (!canRead(current, force)) return;
    reading = true;
    try {
      const post = await read(controller.signal);
      deliver(post, current.post.revision);
    } catch (error) {
      failure(error);
    } finally {
      reading = false;
      if (pending) {
        pending = false;
        void refresh(true);
      }
    }
  }
  stream.onopen = () => { if (!stopped) status("connected"); };
  stream.onerror = () => {
    if (stopped) return;
    status("reconnecting");
    if (stream.readyState === 2) void refresh(true);
  };
  stream.addEventListener("revision", (event) => {
    if (stopped) return;
    const data = JSON.parse((event as MessageEvent).data) as {
      id: string;
      revision: string;
      deleted: boolean;
    };
    if (data.id !== options.id) return;
    if (data.deleted) return deleted();
    status("connected");
    wanted = data.revision;
    void refresh();
  });
  stream.addEventListener("unauthorized", () => {
    if (stopped) return;
    stopped = true;
    stream.close();
    status("unauthorized");
  });
  return {
    refresh,
    close() {
      stopped = true;
      controller.abort();
      stream.close();
    },
  };
}
