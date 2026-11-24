import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import "../admin/editor-actions.css";

export type EditorMenuItem = {
  label: string;
  icon: LucideIcon;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
};

/** The options menu shared by the writer's pad and Notes. */
export default function EditorOptionsMenu({ label, items, footer }: {
  label: string;
  items: EditorMenuItem[];
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function select(action: () => void) {
    setOpen(false);
    trigger.current?.focus();
    action();
  }
  return (
    <div className="editor-actions" ref={root} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }}>
      <button type="button" ref={trigger} className="editor-actions-trigger" aria-label={label}
        aria-describedby={`${id}-tip`} aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(!open)}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      <span id={`${id}-tip`} role="tooltip" className="editor-actions-tooltip">{label}</span>
      {open && <div id={id} className="editor-actions-panel" role="group" aria-label={label}>
        {items.map(item => <button key={item.label} type="button" disabled={item.disabled}
          className={item.danger ? "is-danger" : undefined} onClick={() => select(item.run)}>
          <item.icon size={16} aria-hidden="true" />{item.label}
        </button>)}
        {footer}
      </div>}
    </div>
  );
}
