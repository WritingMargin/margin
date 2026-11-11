import { useEffect, useId, useRef } from "react";
import { FilePenLine } from "lucide-react";
import { useOverlayFocus } from "../useOverlayFocus";
import type { useConfirmation } from "./useConfirmation";
import "./confirmation.css";

export default function ConfirmDialog({ confirmation }: {
  confirmation: ReturnType<typeof useConfirmation>;
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
          <span className="confirmation-icon" aria-hidden="true"><FilePenLine size={21} /></span>
          <h2 id={titleId}>{prompt.title}</h2>
        </header>
        <div className="confirmation-content"><p id={descriptionId}>{prompt.description}</p></div>
        <footer className="confirmation-actions">
          <button className="button confirmation-discard" onClick={() => answer(true)}>Discard changes</button>
          <button ref={keepEditing} className="button primary" onClick={() => answer(false)}>Keep editing</button>
        </footer>
      </>}
    </dialog>
  );
}
