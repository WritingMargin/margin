import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./scroll-tabs.css";

function useTabSwipe(track: React.RefObject<HTMLDivElement | null>) {
  const state = useRef({ active: false, dragged: false, startX: 0, startLeft: 0 });
  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0 || !track.current) return;
    state.current = {
      active: true,
      dragged: false,
      startX: event.clientX,
      startLeft: track.current.scrollLeft,
    };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!state.current.active || !track.current) return;
    const delta = event.clientX - state.current.startX;
    if (Math.abs(delta) > 5) state.current.dragged = true;
    if (state.current.dragged) track.current.scrollLeft = state.current.startLeft - delta;
  }
  function end() {
    state.current.active = false;
  }
  function click(event: MouseEvent<HTMLDivElement>) {
    if (!state.current.dragged) return;
    state.current.dragged = false;
    event.preventDefault();
    event.stopPropagation();
  }
  return { start, move, end, click };
}

function revealActiveTab(element: HTMLDivElement | null) {
  const selected = element?.querySelector<HTMLElement>(
    '[aria-selected="true"], [aria-pressed="true"], .active',
  );
  if (!element || !selected) return;
  const bounds = element.getBoundingClientRect();
  const tab = selected.getBoundingClientRect();
  if (tab.left < bounds.left) element.scrollBy({ left: tab.left - bounds.left - 8 });
  else if (tab.right > bounds.right) element.scrollBy({ left: tab.right - bounds.right + 8 });
}

export default function ScrollTabs({
  children,
  label,
  role = "tablist",
  className = "settings-tabs",
}: {
  children: ReactNode;
  label: string;
  role?: "tablist" | "group";
  className?: string;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const swipe = useTabSwipe(track);
  function measure() {
    const element = track.current;
    if (!element) return;
    const next = {
      left: element.scrollLeft > 1,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    };
    setEdges((prev) =>
      prev.left === next.left && prev.right === next.right ? prev : next,
    );
  }
  useEffect(() => {
    const element = track.current;
    if (!element || !container.current) return;
    const observer = new ResizeObserver(() => {
      measure();
      revealActiveTab(element);
    });
    observer.observe(container.current);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    measure();
    revealActiveTab(element);
    return () => observer.disconnect();
  }, [children]);
  function scroll(direction: number) {
    const element = track.current;
    if (element) element.scrollBy({ left: direction * Math.max(80, element.clientWidth * 0.75) });
  }
  const overflowing = edges.left || edges.right;
  return (
    <div ref={container} className="scroll-tabs">
      <button
        type="button"
        className="scroll-tabs-control"
        aria-label={`Scroll ${label} left`}
        title={`Scroll ${label} left`}
        aria-controls={id}
        hidden={!overflowing}
        disabled={!edges.left}
        onClick={() => scroll(-1)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>
      <div
        ref={track}
        id={id}
        className={`scroll-tabs-track ${className}`.trim()}
        role={role}
        aria-label={label}
        onScroll={measure}
        onPointerDown={swipe.start}
        onPointerMove={swipe.move}
        onPointerUp={swipe.end}
        onPointerCancel={swipe.end}
        onClickCapture={swipe.click}
      >
        {children}
      </div>
      <button
        type="button"
        className="scroll-tabs-control"
        aria-label={`Scroll ${label} right`}
        title={`Scroll ${label} right`}
        aria-controls={id}
        hidden={!overflowing}
        disabled={!edges.right}
        onClick={() => scroll(1)}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
