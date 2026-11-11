import { useEffect, useRef, type RefObject } from "react";
export function useOverlayFocus(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  close: () => void,
) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const previous = document.activeElement as HTMLElement | null;
    const selector =
      "button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)";
    panel.querySelector<HTMLElement>(selector)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !panel.querySelector(":popover-open")) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      }
      if (event.key === "Tab") trapFocus(event, panel, selector);
    };
    panel.addEventListener("keydown", onKey);
    return () => {
      panel.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [active, ref]);
}
function trapFocus(event: KeyboardEvent, panel: HTMLElement, selector: string) {
  const items = Array.from(
    panel.querySelectorAll<HTMLElement>(selector),
  ).filter((item) => item.getClientRects().length > 0);
  const first = items[0],
    last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
