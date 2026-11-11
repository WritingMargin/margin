import { useCallback, useEffect, useState } from "react";
import { type Comment } from "../../shared/types";
import { api } from "../api";

export type ModerationComment = Comment;
type Kind = "all" | "questions" | "comments";
type CommentsPage = { comments: ModerationComment[]; hasMore: boolean; counts: { pending: number; total: number } };

export function useCommentsAdmin({
  notify,
  filter,
  setFilter,
}: {
  notify: (s: string) => void;
  filter: "pending" | "all";
  setFilter: (filter: "pending" | "all") => void;
}) {
  const [kind, setKind] = useState<Kind>("all");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<CommentsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    setLoading(true);
    return api<CommentsPage>(`/comments?status=${filter}&kind=${kind}&offset=${offset}`)
      .then(setPage)
      .catch((cause) => notify((cause as Error).message))
      .finally(() => setLoading(false));
  }, [filter, kind, offset, notify]);
  useEffect(() => { void refresh(); }, [refresh]);
  return {
    notify, filter, setFilter, kind,
    setKind: (next: Kind) => { setKind(next); setOffset(0); },
    setOffset, offset,
    comments: page?.comments || [],
    hasMore: page?.hasMore || false,
    counts: page?.counts || { pending: 0, total: 0 },
    loading, refresh,
  };
}
export type CommentsAdminController = ReturnType<typeof useCommentsAdmin>;
