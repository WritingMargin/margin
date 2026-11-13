import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import "./passage-interactions.css";

/** Shared reader dialog used by Notes and the guide's sign-in flow. */
export default function ReaderDialog({open, title, className = "", dismissDisabled = false, onClose, children}: {
  open: boolean;
  title: ReactNode;
  className?: string;
  dismissDisabled?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  return <dialog ref={dialog} className={`passage-dialog ${className}`} aria-labelledby={titleId} onCancel={event => {
    event.preventDefault();
    if (!dismissDisabled) onClose();
  }} onClose={onClose}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="button" aria-label="Close" disabled={dismissDisabled} onClick={onClose}><X size={16} /></button></header>
    <div className="passage-dialog-body">{children}</div>
  </dialog>;
}
