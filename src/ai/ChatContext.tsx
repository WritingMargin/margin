import { useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  writingModes,
  type WritingMode,
  type WritingSession,
} from "../../shared/writing";

export default function ChatContext({
  session,
  change,
}: {
  session: WritingSession;
  change: (patch: Partial<WritingSession>) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const modeLabel =
    session.mode === "opening" ? "Opening" : writingModes[session.mode].label;

  useLayoutEffect(() => {
    const button = trigger.current;
    const popover = bubble.current;
    if (!open || !button || !popover) return;
    const position = () => positionContext(button, popover);
    position();
    popover
      .querySelector<HTMLInputElement>("input:checked")
      ?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(button.closest(".writing-assistant")!);
    observer.observe(button.closest(".chat-compose-box")!);
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="chat-context-trigger"
        aria-label={`Context options: ${writingModes[session.mode].label}`}
        title="Context options"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        popoverTarget={id}
      >
        <span>{modeLabel}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div
        id={id}
        ref={bubble}
        className="chat-context-fields"
        role="dialog"
        aria-labelledby={`${id}-heading`}
        popover="auto"
        onBeforeToggle={(event) => {
          if (event.newState === "open" && trigger.current)
            positionContext(trigger.current, event.currentTarget);
        }}
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <header className="chat-context-heading">
          <h3 id={`${id}-heading`}>Writing options</h3>
        </header>
        <fieldset className="chat-mode-options" disabled={session.busy}>
          <legend className="sr-only">Planning mode</legend>
          {(
            Object.entries(writingModes) as [
              WritingMode,
              (typeof writingModes)[WritingMode],
            ][]
          ).map(([key, mode]) => {
            return (
              <label
                className="chat-mode-option"
                key={key}
                title={mode.description}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name={`${id}-mode`}
                  value={key}
                  checked={session.mode === key}
                  aria-label={mode.label}
                  aria-describedby={`${id}-${key}-description`}
                  onChange={() => change({ mode: key })}
                />
                <span>{mode.label}</span>
                <span className="sr-only" id={`${id}-${key}-description`}>
                  {mode.description}
                </span>
                <Check
                  className="chat-mode-check"
                  size={14}
                  aria-hidden="true"
                />
              </label>
            );
          })}
        </fieldset>
        <label className="chat-audience-field">
          <span>
            Audience <small>Optional</small>
          </span>
          <input
            type="text"
            aria-label="Audience"
            form=""
            value={session.audience}
            maxLength={500}
            disabled={session.busy}
            placeholder="Who are you writing for?"
            onChange={(e) => change({ audience: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                bubble.current?.hidePopover();
              }
            }}
          />
        </label>
      </div>
    </>
  );
}

// Keep the native popover above its trigger and within the assistant's edges,
// even when its scrollable dock or the mobile keyboard changes the available space.
function positionContext(button: HTMLElement, popover: HTMLElement) {
  const panel = button.closest(".writing-assistant")!.getBoundingClientRect();
  const target = button.getBoundingClientRect();
  const inset = 8;
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const triggerTop = target.top + Math.max(0, (target.height - 26) / 2);
  const bottom = Math.min(triggerTop, viewportBottom) - 4;
  const leftEdge = Math.max(panel.left, 0) + inset;
  const rightEdge =
    Math.min(panel.right, document.documentElement.clientWidth) - inset;
  const width = Math.min(264, rightEdge - leftEdge);
  popover.style.width = width + "px";
  popover.style.left =
    Math.max(leftEdge, Math.min(target.left, rightEdge - width)) + "px";
  popover.style.maxHeight = Math.max(44, bottom - viewportTop - inset) + "px";
  popover.style.top = bottom + "px";
}
