import {
  useLayoutEffect,
  useRef,
  useState,
  useId,
  type CSSProperties,
} from "react";
import { X } from "lucide-react";
import type { ReactNode } from "react";
export type PassageAnchor = HTMLElement | Range;

export default function PassagePopover({
  anchor,
  heading,
  children,
  wide = false,
  onClose,
}: {
  anchor: PassageAnchor;
  heading: string;
  children: ReactNode;
  wide?: boolean;
  onClose: () => void;
}) {
  const bubble = useRef<HTMLDivElement>(null);
  const title = useId();
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    const node = bubble.current;
    if (!node) return;
    node.showPopover();
    function measure() {
      if (node) setPosition(conversationPosition(anchor, node, wide));
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    node
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchor, wide]);
  return (
    <div
      className={`passage-dialog passage-conversation${wide ? " passage-composer" : ""}`}
      ref={bubble}
      popover="auto"
      role="dialog"
      aria-labelledby={title}
      style={position}
      onToggle={(event) => {
        if (event.newState === "closed") onClose();
      }}
    >
      <header>
        <h2 id={title}>{heading}</h2>
        <button
          type="button"
          className="button"
          aria-label="Close"
          onClick={() => {
            onClose();
            if (anchor instanceof HTMLElement)
              anchor.focus({ preventScroll: true });
          }}
        >
          <X size={16} />
        </button>
      </header>
      <div className="passage-conversation-scroll">{children}</div>
    </div>
  );
}

function conversationPosition(
  anchor: PassageAnchor,
  bubble: HTMLElement,
  wide: boolean,
): CSSProperties {
  const target = anchor.getBoundingClientRect();
  const bounds = bubble.getBoundingClientRect();
  const gap = 12;
  const edge = 12;
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  if (wide && width - target.right >= bounds.width + gap + edge)
    return sidePosition(target, bounds, height, "right");
  if (wide && target.left >= bounds.width + gap + edge)
    return sidePosition(target, bounds, height, "left");
  const below = height - target.bottom - gap - edge;
  const above = target.top - gap - edge;
  const goesBelow = below >= bounds.height || below >= above;
  const maxHeight = Math.max(80, goesBelow ? below : above);
  const center = target.left + target.width / 2;
  const left = Math.max(
    edge,
    Math.min(center - bounds.width + 30, width - bounds.width - edge),
  );
  const top = goesBelow
    ? target.bottom + gap
    : target.top - gap - Math.min(bounds.height, maxHeight);
  return {
    left,
    top: Math.max(
      edge,
      Math.min(top, height - Math.min(bounds.height, maxHeight) - edge),
    ),
    "--conversation-height": maxHeight + "px",
    "--conversation-tail-left":
      Math.max(20, Math.min(center - left, bounds.width - 20)) + "px",
    "--conversation-tail-top": goesBelow ? "-6px" : "calc(100% - 6px)",
    "--conversation-tail-rotation": goesBelow ? "45deg" : "225deg",
  } as CSSProperties;
}
function sidePosition(
  target: DOMRect,
  bounds: DOMRect,
  height: number,
  side: "left" | "right",
): CSSProperties {
  const maxHeight = height - 24;
  const top = Math.max(
    12,
    Math.min(target.top - 24, height - Math.min(bounds.height, maxHeight) - 12),
  );
  return {
    top,
    left:
      side === "right" ? target.right + 12 : target.left - bounds.width - 12,
    "--conversation-height": maxHeight + "px",
    "--conversation-tail-left": side === "right" ? "0px" : "100%",
    "--conversation-tail-top":
      Math.max(
        20,
        Math.min(
          target.top + target.height / 2 - top,
          Math.min(bounds.height, maxHeight) - 20,
        ),
      ) + "px",
    "--conversation-tail-rotation": side === "right" ? "315deg" : "135deg",
  } as CSSProperties;
}
