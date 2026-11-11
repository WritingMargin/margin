import { useEffect, useState } from "react";
import type { PostRevision, PostRevisionSummary } from "../../shared/revisions";
import { api } from "../api";

export function useRevisionHistory(postId: string) {
  const base = `/posts/${encodeURIComponent(postId)}/revisions`;
  const [versions, setVersions] = useState<PostRevisionSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [version, setVersion] = useState<PostRevision | null>(null);
  const [previous, setPrevious] = useState<PostRevision | null>(null);
  const [detailError, setDetailError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setListError("");
    api<PostRevisionSummary[]>(base + (cursor ? `?before=${cursor}` : ""))
      .then((items) => {
        if (!active) return;
        setVersions((previous) =>
          cursor
            ? [...previous.filter((v) => v.version >= cursor), ...items]
            : items,
        );
        setMore(items.length === 50);
        setSelected((current) => current || items[0]?.revision || "");
      })
      .catch((e) => {
        if (active) setListError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, cursor, retry]);
  useEffect(() => {
    let active = true;
    setVersion(null);
    setDetailError("");
    if (!selected) return;
    api<PostRevision>(`${base}/${encodeURIComponent(selected)}`)
      .then(async (result) => {
        const previous = result.previousRevision
          ? await api<PostRevision>(
              `${base}/${encodeURIComponent(result.previousRevision)}`,
            )
          : null;
        if (active) {
          setVersion(result);
          setPrevious(previous);
        }
      })
      .catch((e) => {
        if (active) setDetailError(e.message);
      });
    return () => {
      active = false;
    };
  }, [base, selected, retry]);
  return {
    previous,
    versions,
    selected,
    setSelected,
    version: version?.revision === selected ? version : null,
    more,
    loading,
    listError,
    detailError,
    retry: () => setRetry((value) => value + 1),
    loadMore: () => setCursor(versions[versions.length - 1].version),
  };
}
