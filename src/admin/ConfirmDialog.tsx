import { useEffect, useId, useRef, type ReactNode } from "react";
import { FilePenLine } from "lucide-react";
import { useOverlayFocus } from "../useOverlayFocus";
import type { useConfirmation } from "./useConfirmation";
import "./confirmation.css";

export default function ConfirmDialog({ confirmation, icon }: {
  confirmation: ReturnType<typeof useConfirmation>;
  icon?: ReactNode;
}) {
  const { prompt, answer } = confirmation;
  const dialog = useRef<HTMLDialogElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const titleId = useId(), descriptionId = useId();
  useOverlayFocus(dialog, !!prompt, () => answer(false));
  useEffect(() => {
    if (prompt) {
      dialog.current?.showModal();
      keepEditing.current?.focus();
    }
    else dialog.current?.close();
  }, [prompt]);
  return (
    <dialog ref={dialog} className="confirmation-dialog" aria-labelledby={titleId}
      aria-describedby={descriptionId} onCancel={(event) => {
        event.preventDefault();
        answer(false);
      }}>
      {prompt && <>
        <header className="confirmation-heading">
          <span className="confirmation-icon" aria-hidden="true">{icon ?? <FilePenLine size={21} />}</span>
          <h2 id={titleId}>{prompt.title}</h2>
        </header>
        <div className="confirmation-content"><p id={descriptionId}>{prompt.description}</p></div>
        <footer className="confirmation-actions">
          <button className="button confirmation-discard" onClick={() => answer(true)}>{prompt.confirmLabel ?? "Discard changes"}</button>
          <button ref={keepEditing} className="button primary" onClick={() => answer(false)}>{prompt.cancelLabel ?? "Keep editing"}</button>
        </footer>
      </>}
    </dialog>
  );
}
