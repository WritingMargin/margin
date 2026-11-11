import type { WriterEditor } from "../editor/editor-handle";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { AdminRoute } from "../admin-route";

type SearchOrigin = {
  route: AdminRoute;
  selection?: { start: number; end: number; scrollTop: number };
};

export function usePostSearch(
  route: AdminRoute,
  postId: string,
  navigate: (route: AdminRoute) => boolean | Promise<boolean>,
  editor: RefObject<WriterEditor | null>,
) {
  const [query, setQuery] = useState("");
  const origin = useRef<SearchOrigin | null>(null);

  // Browser Back and opening a result end the temporary search too.
  useEffect(() => {
    if (route.view === "posts") return;
    const previous = origin.current;
    if (sameEditor(previous?.route, route)) {
      restoreSelection(editor.current, previous?.selection);
    }
    origin.current = null;
    setQuery("");
  }, [route.view, route.postId]);

  async function close() {
    const target = origin.current;
    if (target && !(await navigate(target.route))) return;
    setQuery("");
  }

  async function update(value: string) {
    if (!value) {
      close();
      return;
    }
    if (route.view !== "posts") {
      const target = captureOrigin(route, postId, editor.current);
      if (!(await navigate({ view: "posts" }))) return;
      origin.current = target;
    }
    setQuery(value);
  }

  return {
    query,
    update,
    filter: setQuery,
    close,
    canResume: !!origin.current,
  };
}

function sameEditor(previous: AdminRoute | undefined, route: AdminRoute) {
  return (
    previous?.view === "editor" &&
    route.view === "editor" &&
    (previous.postId || "") === (route.postId || "")
  );
}

function captureOrigin(
  route: AdminRoute,
  postId: string,
  editor: WriterEditor | null,
): SearchOrigin | null {
  if (route.view !== "editor" || (route.postId || "") !== postId) return null;
  return {
    route,
    selection: editor
      ? {
          start: editor.selectionStart,
          end: editor.selectionEnd,
          scrollTop: editor.scrollTop,
        }
      : undefined,
  };
}

function restoreSelection(
  editor: WriterEditor | null,
  selection: SearchOrigin["selection"],
) {
  if (!editor || !selection) return;
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(selection.start, selection.end);
  editor.scrollTop = selection.scrollTop;
}
