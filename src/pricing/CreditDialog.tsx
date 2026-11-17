import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import "./credit-dialog.css";

export default function CreditDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("input, select")?.focus();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="credit-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></header>
    {children}
  </dialog>;
}
