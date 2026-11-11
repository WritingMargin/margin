import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  ResearchContext,
  ResearchSource,
  SavedWritingNote,
} from "../../shared/writing";
import { api, json } from "../api";

type Library = {
  sources: ResearchSource[];
  notes: SavedWritingNote[];
  error: string;
  refresh: () => void;
  saveSource: (source: ResearchSource) => Promise<void>;
};
const LibraryContext = createContext<Library | null>(null);

export function useResearchLibrary() {
  const library = useContext(LibraryContext);
  if (!library) throw new Error("Research tools require a draft library.");
  return library;
}

type LibraryData = Pick<Library, "sources" | "notes"> & { postId: string };
export function ResearchLibraryProvider({
  postId,
  active,
  refreshKey,
  children,
}: {
  postId: string;
  active: boolean;
  refreshKey?: ResearchContext;
  children: ReactNode;
}) {
  const [data, setData] = useState<LibraryData>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const base = "/posts/" + encodeURIComponent(postId);
  useEffect(() => {
    if (!postId || !active) return;
    const controller = new AbortController();
    const init = { signal: controller.signal };
    setError("");
    Promise.all([
      api<ResearchSource[]>(base + "/sources", init),
      api<SavedWritingNote[]>(base + "/writing-notes", init),
    ])
      .then(([sources, notes]) => {
        if (!controller.signal.aborted) setData({ postId, sources, notes });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [active, base, postId, refreshKey, revision]);

  async function saveSource(source: ResearchSource) {
    await api(base + "/sources", json("POST", source));
    refresh();
  }
  const current = data?.postId === postId ? data : undefined;
  return (
    <LibraryContext.Provider
      value={{
        sources: current?.sources ?? [],
        notes: current?.notes ?? [],
        error,
        refresh,
        saveSource,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}
