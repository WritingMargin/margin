import { useEffect, useRef, type RefObject } from "react";
import { normalizePassage, passageSelectionOccurrence } from "./passage-anchors";

const controls =
  ".passage-selection, .passage-tools, .passage-dialog, .passage-bubble";

export function usePassageSelection(
  content: RefObject<HTMLElement | null>,
  root: RefObject<HTMLElement | null>,
  enabled: boolean,
  onSelection: (
    selection: { quote: string; occurrence: number; top: number; left: number; range: Range } | null,
  ) => void,
) {
  const callback = useRef(onSelection);
  useEffect(() => {
    callback.current = onSelection;
  }, [onSelection]);
  useEffect(() => {
    if (!enabled) {
      callback.current(null);
      return;
    }
    let frame = 0;
    let dragging = false;
    let selectingContent = true;
    function read() {
      callback.current(readPassageSelection(content.current, root.current));
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    }
    function start(event: PointerEvent) {
      dragging = true;
      cancelAnimationFrame(frame);
      selectingContent =
        event.target instanceof Node &&
        !!content.current?.contains(event.target);
      if (!(
        event.target instanceof Element &&
        event.target.closest(".passage-selection")
      ))
        callback.current(null);
    }
    function finish(event: Event) {
      dragging = false;
      if (
        selectingContent &&
        !(event.target instanceof Element && event.target.closest(controls))
      )
        schedule();
    }
    function keyup(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelAnimationFrame(frame);
        selectingContent = false;
        callback.current(null);
      } else if (!document.activeElement?.closest(controls)) {
        selectingContent = true;
        schedule();
      }
    }
    function changed() {
      if (
        selectingContent &&
        !dragging &&
        !document.activeElement?.closest(controls)
      )
        schedule();
    }
    // A drag may end outside the article; mobile selection handles can change
    // the range after touchend. Read the final native range on the next frame.
    document.addEventListener("selectionchange", changed);
    document.addEventListener("pointerdown", start);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    document.addEventListener("keyup", keyup);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("selectionchange", changed);
      document.removeEventListener("pointerdown", start);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      document.removeEventListener("keyup", keyup);
    };
  }, [content, root, enabled]);
}

function readPassageSelection(
  content: HTMLElement | null,
  root: HTMLElement | null,
) {
  const selection = window.getSelection();
  if (!content || !root || !selection?.rangeCount) return null;
  if (
    !content.contains(selection.anchorNode) ||
    !content.contains(selection.focusNode)
  )
    return null;
  const quote = normalizePassage(selection.toString());
  if (!quote || quote.length > 2000) return null;
  const bounds = selection.getRangeAt(0).getBoundingClientRect();
  const rootBounds = root.getBoundingClientRect();
  return {
    quote,
    occurrence: passageSelectionOccurrence(content, selection.getRangeAt(0), quote),
    top: bounds.bottom - rootBounds.top + 8,
    left: Math.max(0, Math.min(bounds.left - rootBounds.left, rootBounds.width - (window.innerWidth <= 600 ? 264 : 280))),
    range: selection.getRangeAt(0).cloneRange(),
  };
}
