import { useRef, useState, type PointerEvent, type RefObject } from "react";
export function useSheetDrag(
  panel: RefObject<HTMLElement | null>,
  expanded: boolean,
  setExpanded: (value: boolean) => void,
  close: () => void,
) {
  const start = useRef<{ y: number; height: number } | null>(null);
  const moved = useRef(false);
  const [height, setHeight] = useState<number | null>(null);
  function down(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !panel.current) return;
    start.current = {
      y: event.clientY,
      height: panel.current.getBoundingClientRect().height,
    };
    moved.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!start.current) return;
    const delta = event.clientY - start.current.y;
    moved.current = Math.abs(delta) > 8;
    setHeight(
      Math.max(
        180,
        Math.min(window.innerHeight - 12, start.current.height - delta),
      ),
    );
  }
  function up(event: PointerEvent<HTMLButtonElement>) {
    if (!start.current) return;
    const delta = event.clientY - start.current.y;
    moved.current = Math.abs(delta) > 8;
    start.current = null;
    setHeight(null);
    if (delta > 80) close();
    else if (delta < -50) setExpanded(true);
  }
  function cancel() {
    start.current = null;
    moved.current = true;
    setHeight(null);
  }
  function click() {
    if (moved.current) {
      moved.current = false;
      return;
    }
    setExpanded(!expanded);
  }
  return {
    height,
    handlers: {
      onPointerDown: down,
      onPointerMove: move,
      onPointerUp: up,
      onPointerCancel: cancel,
      onClick: click,
    },
  };
}
