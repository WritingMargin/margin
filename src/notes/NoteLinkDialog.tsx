import { useEffect, useRef, useState, type FormEvent } from "react";
import { normalizeNoteUrl } from "../../shared/notes";
import { useOverlayFocus } from "../useOverlayFocus";

export default function NoteLinkDialog({ onInsert, onClose }: {
  onInsert: (url: string, label: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  useOverlayFocus(dialog, true, onClose);

  function insert(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeNoteUrl(url);
    if (!normalized) {
      setError("Enter a valid http or https link without spaces.");
      return;
    }
    onInsert(normalized, label.trim());
  }

  return (
    <dialog ref={dialog} className="note-link-dialog" aria-label="Insert link"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <form onSubmit={insert}>
        <h2>Insert link</h2>
        <label>Link URL
          <input autoFocus type="text" value={url} placeholder="https://example.com"
            onChange={(event) => { setUrl(event.target.value); setError(""); }} />
        </label>
        <label>Link text
          <input type="text" value={label} placeholder="Selected text or URL"
            onChange={(event) => setLabel(event.target.value)} />
        </label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" className="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary">Insert link</button>
        </footer>
      </form>
    </dialog>
  );
}
