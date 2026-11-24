import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceNote } from "../../shared/notes";
import { api, json } from "../api";

export type NotePatch = Partial<Pick<WorkspaceNote, "title" | "content" | "links" | "isPublic">>;

export function useNotesStore(notify: (message: string) => void) {
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const saves = useRef(new Map<string, Promise<WorkspaceNote | null>>());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const items = await api<WorkspaceNote[]>("/notes");
      setNotes(items);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upsert = useCallback((saved: WorkspaceNote) => {
    setNotes((current) => [
      saved,
      ...current.filter((item) => item.id !== saved.id),
    ]);
  }, []);

  const createNote = useCallback(async () => {
    setBusyId("new");
    try {
      const created = await api<WorkspaceNote>(
        "/notes",
        json("POST", { title: "", content: "", links: [], isPublic: false }),
      );
      upsert(created);
      return created;
    } catch (cause) {
      notify((cause as Error).message);
      return null;
    } finally {
      setBusyId(null);
    }
  }, [notify, upsert]);

  const updateNote = useCallback(
    (id: string, patch: NotePatch) => {
      setBusyId(id);
      const pending = saves.current.get(id) || Promise.resolve(null);
      const save = pending.then(async () => {
        try {
          const updated = await api<WorkspaceNote>(
            `/notes/${encodeURIComponent(id)}`,
            { ...json("PUT", patch), keepalive: new TextEncoder().encode(JSON.stringify(patch)).length < 60_000 },
          );
          upsert(updated);
          return updated;
        } catch (cause) {
          notify((cause as Error).message);
          return null;
        }
      }).finally(() => {
        if (saves.current.get(id) !== save) return;
        saves.current.delete(id);
        setBusyId((current) => current === id ? null : current);
      });
      saves.current.set(id, save);
      return save;
    },
    [notify, upsert],
  );

  const removeNote = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        await api(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
        setNotes((current) => current.filter((item) => item.id !== id));
        notify("Note removed.");
        return true;
      } catch (cause) {
        notify((cause as Error).message);
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [notify],
  );

  const setShareLink = useCallback(
    async (id: string, enabled: boolean, regenerate = false) => {
      setBusyId(id);
      try {
        const updated = await api<WorkspaceNote>(
          `/notes/${encodeURIComponent(id)}/share`,
          json("POST", { enabled, ...(regenerate ? { regenerate: true } : {}) }),
        );
        upsert(updated);
        return updated;
      } catch (cause) {
        notify((cause as Error).message);
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [notify, upsert],
  );

  const duplicateNote = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const copy = await api<WorkspaceNote>(
          `/notes/${encodeURIComponent(id)}/duplicate`,
          json("POST", {}),
        );
        upsert(copy);
        notify("Note duplicated to your notes.");
        return copy;
      } catch (cause) {
        notify((cause as Error).message);
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [notify, upsert],
  );

  return {
    notes,
    loading,
    error,
    busyId,
    reload: load,
    createNote,
    updateNote,
    removeNote,
    setShareLink,
    duplicateNote,
  };
}
