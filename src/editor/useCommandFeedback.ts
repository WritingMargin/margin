import { useEffect, useRef, type MouseEvent } from "react";

/** Brief confirmation for insertion commands, without implying a formatting mode. */
export function useCommandFeedback() {
  const last = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clear() {
    last.current?.removeAttribute("data-feedback");
    last.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => clear, []);
  return (event: MouseEvent<HTMLElement>) => {
    const button = event.target instanceof Element
      ? event.target.closest("button")
      : null;
    if (!button || !event.currentTarget.contains(button) || button.disabled) return;
    // Toggles and open panels already expose their actual persistent state.
    if (button.matches("[aria-pressed], [aria-selected], [aria-expanded]")) return;
    clear();
    last.current = button;
    button.setAttribute("data-feedback", "true");
    timer.current = setTimeout(clear, 1200);
  };
}
