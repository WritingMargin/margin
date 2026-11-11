import { useEffect, useRef } from "react";
import { shareMenuPosition } from "./share-position";

export function useShareMenu() {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const details = menu.current;
    const summary = details?.querySelector("summary");
    const panel = details?.querySelector<HTMLElement>(".share-menu");
    if (!details || !summary || !panel) return;
    const position = () => {
      if (!details.open) return;
      const placement = shareMenuPosition(
        summary.getBoundingClientRect(),
        details.getBoundingClientRect(),
        { width: panel.offsetWidth, height: panel.scrollHeight + 2 },
        {
          width: document.documentElement.clientWidth,
          height: window.innerHeight,
        },
      );
      Object.assign(panel.style, {
        left: `${placement.left}px`,
        right: "auto",
        top: placement.top === undefined ? "auto" : `${placement.top}px`,
        bottom:
          placement.bottom === undefined ? "auto" : `${placement.bottom}px`,
        maxHeight: `${placement.maxHeight}px`,
      });
    };
    const dismiss = (event: PointerEvent) => {
      if (!details.parentElement?.contains(event.target as Node))
        details.open = false;
    };
    const observer = new ResizeObserver(position);
    observer.observe(summary);
    observer.observe(panel);
    details.addEventListener("toggle", position);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      observer.disconnect();
      details.removeEventListener("toggle", position);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, []);
  const close = () => {
    if (!menu.current) return;
    menu.current.open = false;
    menu.current.querySelector("summary")?.focus({ preventScroll: true });
  };
  return { menu, close };
}
