import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function FormattingToolbar({ children }: { children: ReactNode }) {
  const id = useId();
  const bar = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  function measure() {
    const element = bar.current;
    if (!element) return;
    setEdges({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
  }
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  function scroll(direction: number) {
    const element = bar.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(80, element.clientWidth * 0.8) });
  }
  return (
    <div className="format-toolbar">
      <button className="format-scroll-control" type="button" aria-label="Scroll writer actions left" title="Scroll writer actions left" aria-controls={id} hidden={!edges.left && !edges.right} disabled={!edges.left} onClick={() => scroll(-1)}>
        <ChevronLeft size={17} aria-hidden="true" />
      </button>
      <div ref={bar} id={id} className="format-bar" role="group" aria-label="Formatting controls" tabIndex={0} onScroll={measure}>
        {children}
      </div>
      <button className="format-scroll-control" type="button" aria-label="Scroll writer actions right" title="Scroll writer actions right" aria-controls={id} hidden={!edges.left && !edges.right} disabled={!edges.right} onClick={() => scroll(1)}>
        <ChevronRight size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
