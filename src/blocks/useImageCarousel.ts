import {
Children,
isValidElement,
useEffect,
useId,
useRef,
useState,
type ReactNode,
} from "react";
import "./carousel.css";

export function useImageCarousel({
  children,
  title = "Image gallery",
  fit = "contain",
}: {
  children: ReactNode;
  title?: string;
  fit?: "contain" | "cover";
}) {
  const slides = Children.toArray(children).filter(isValidElement);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: number;
    x: number;
    scroll: number;
    moved: boolean;
  } | null>(null);
  const [active, setActive] = useState(0);
  const id = useId();
  const targets = () => {
    const el = track.current;
    if (!el) return [];
    return Array.from(el.children, (child) =>
      Math.min(
        (child as HTMLElement).offsetLeft,
        el.scrollWidth - el.clientWidth,
      ),
    );
  };
  const nearest = () => {
    const offsets = targets();
    const left = track.current?.scrollLeft || 0;
    return offsets.reduce(
      (best, offset, index) =>
        Math.abs(offset - left) < Math.abs(offsets[best] - left) ? index : best,
      0,
    );
  };
  const go = (index: number) => {
    const offsets = targets();
    track.current?.scrollTo({
      left: offsets[Math.max(0, Math.min(index, offsets.length - 1))] || 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => setActive(nearest());
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();
    return () => observer.disconnect();
  }, [slides.length]);
  const finishDrag = () => {
    const el = track.current;
    const gesture = drag.current;
    if (!el || !gesture) return;
    drag.current = null;
    delete el.dataset.dragging;
    if (el.hasPointerCapture(gesture.id)) el.releasePointerCapture(gesture.id);
    if (gesture.moved) go(nearest());
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const index = {
      ArrowLeft: active - 1,
      ArrowRight: active + 1,
      Home: 0,
      End: slides.length - 1,
    }[event.key];
    if (index !== undefined) {
      event.preventDefault();
      go(index);
    }
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Native touch scrolling preserves momentum, pinch zoom, and vertical page scrolling.
    if (
      event.pointerType === "touch" ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest("a, button")
    )
      return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      scroll: event.currentTarget.scrollLeft,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    const distance = event.clientX - gesture.x;
    if (Math.abs(distance) > 5) gesture.moved = true;
    if (gesture.moved) {
      event.preventDefault();
      event.currentTarget.dataset.dragging = "true";
      event.currentTarget.scrollLeft = gesture.scroll - distance;
    }
  };
  return {
    onPointerMove,
    onPointerDown,
    onKeyDown,
    title,
    fit,
    slides,
    track,
    drag,
    active,
    setActive,
    id,
    nearest,
    go,
    finishDrag,
  };
}
export type ImageCarouselController = ReturnType<typeof useImageCarousel>;
