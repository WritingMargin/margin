import { useCallback, useEffect, useRef, useState } from "react";
import { api, APIError, json } from "../api";
import type { ReviewVisit } from "./types";

export function useReviewVisit(path: string) {
  const [visit, setVisit] = useState<ReviewVisit | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(false);
  const pending = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    if (!mounted.current) return Promise.resolve();
    if (pending.current) return pending.current;
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    const task = api<ReviewVisit>(path + "/open", {
      ...json("POST", {}),
      signal: request.signal,
    })
      .then((data) => {
        if (request.signal.aborted) return;
        setVisit((last) => ({
          ...data,
          previous:
            data.previous ??
            (last?.post.revision === data.post.revision
              ? (last?.previous ?? null)
              : null),
        }));
        setFailure(null);
      })
      .catch((error: Error) => {
        if (request.signal.aborted) return;
        setFailure(error);
        if (expiredInvitation(error)) setVisit(null);
      })
      .finally(() => {
        if (!request.signal.aborted) {
          pending.current = null;
          setLoading(false);
        }
      });
    pending.current = task;
    return task;
  }, [path]);
  useEffect(() => {
    // Opening records this visit on the server. Start once after effect replay.
    let active = true;
    mounted.current = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      mounted.current = false;
      controller.current?.abort();
      pending.current = null;
    };
  }, [load]);
  async function mutate(endpoint: string, input: object) {
    try {
      await api(
        path + "/" + endpoint,
        json("POST", { ...input, revision: visit?.post.revision }),
      );
    } catch (error) {
      if (mounted.current && expiredInvitation(error)) {
        controller.current?.abort();
        pending.current = null;
        setLoading(false);
        setVisit(null);
        setFailure(error as Error);
      }
      throw error;
    }
    if (pending.current) await pending.current;
    await load();
  }
  return { visit, failure, loading, refresh: load, mutate };
}
function expiredInvitation(error: unknown) {
  return (
    error instanceof APIError && [401, 403, 404].includes(error.status || 0)
  );
}
