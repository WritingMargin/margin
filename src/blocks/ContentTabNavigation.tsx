import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function ContentTabNavigation({ children, title, direction }: {
  children: ReactNode;
  title: string;
  direction: "horizontal" | "vertical";
}) {
  const id = useId();
  const navigation = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  function measure() {
    const element = list.current;
    if (!element || !navigation.current) return;
    const overflow = direction === "horizontal" && element.scrollWidth > navigation.current.clientWidth + 1;
    const next = {
      left: overflow && element.scrollLeft > 1,
      right: overflow && element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    };
    setEdges(previous => previous.left === next.left && previous.right === next.right ? previous : next);
  }
  function revealSelected() {
    const element = list.current;
    const selected = element?.querySelector('[aria-selected="true"]');
    if (!element || !selected || direction !== "horizontal") return;
    const bounds = element.getBoundingClientRect();
    const tab = selected.getBoundingClientRect();
    if (tab.left < bounds.left) element.scrollBy({ left: tab.left - bounds.left });
    else if (tab.right > bounds.right) element.scrollBy({ left: tab.right - bounds.right });
  }
  useEffect(() => {
    const element = list.current;
    if (!element || !navigation.current) return;
    const observer = new ResizeObserver(() => {
      measure();
      revealSelected();
    });
    observer.observe(navigation.current);
    observer.observe(element);
    for (const button of element.children) observer.observe(button);
    measure();
    revealSelected();
    return () => observer.disconnect();
  }, [children, direction]);
  function scroll(direction: number) {
    const element = list.current;
    if (element) element.scrollBy({ left: direction * Math.max(80, element.clientWidth * 0.8) });
  }
  const overflowing = edges.left || edges.right;
  return <div className="content-tab-navigation" ref={navigation}>
    {overflowing && <button type="button" className="content-tab-scroll" aria-label={`Scroll ${title} tabs left`} aria-controls={id} disabled={!edges.left} onClick={() => scroll(-1)}>
      <ChevronLeft size={17} aria-hidden="true" />
    </button>}
    <div ref={list} id={id} className="content-tab-list" role="tablist" aria-label={title} aria-orientation={direction} onScroll={measure}>
      {children}
    </div>
    {overflowing && <button type="button" className="content-tab-scroll" aria-label={`Scroll ${title} tabs right`} aria-controls={id} disabled={!edges.right} onClick={() => scroll(1)}>
      <ChevronRight size={17} aria-hidden="true" />
    </button>}
  </div>;
}
