import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ImagePlus, Sparkles, Upload } from "lucide-react";
import "./media-menu.css";

type Position = { top: number; left: number };
export default function MediaMenu({
  onMedia,
  onGenerate,
}: {
  onMedia: () => void;
  onGenerate: () => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const close = () => setPosition(null);
  function open() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)),
      top: Math.min(rect.bottom + 8, window.innerHeight - 144),
    });
  }
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target))
        close();
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [position]);
  function select(action: () => void) {
    close();
    trigger.current?.focus();
    action();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      event.stopPropagation();
      close();
      trigger.current?.focus();
      return;
    }
    navigateMenu(event);
  }
  return (
    <>
      <button
        ref={trigger}
        className="editor-media-trigger"
        title="Add media"
        aria-label="Add media"
        aria-haspopup="menu"
        aria-expanded={!!position}
        aria-controls={position ? id : undefined}
        onClick={() => (position ? close() : open())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            open();
          }
        }}
      >
        <ImagePlus size={16} aria-hidden="true" /> Media
        <ChevronDown size={11} />
      </button>
      {position &&
        createPortal(
          <div
            ref={menu}
            id={id}
            className="editor-media-menu editor-button-surface"
            role="menu"
            aria-label="Add media"
            style={position}
            onKeyDown={onKeyDown}
            onBlur={(event) => {
              if (event.relatedTarget === trigger.current) return;
              if (!event.currentTarget.contains(event.relatedTarget)) close();
            }}
          >
            <button role="menuitem" onClick={() => select(onMedia)}>
              <Upload size={17} />
              <span>
                Insert media<small>Upload, library, or a link</small>
              </span>
            </button>
            <button role="menuitem" onClick={() => select(onGenerate)}>
              <Sparkles size={17} />
              <span>
                Generate image<small>Create an image with AI</small>
              </span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
function navigateMenu(event: KeyboardEvent<HTMLDivElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
  );
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "ArrowUp" ? current - 1 : current + 1;
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (next + buttons.length) % buttons.length;
  buttons[index]?.focus();
}
