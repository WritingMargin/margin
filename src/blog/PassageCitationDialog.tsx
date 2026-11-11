import { useEffect, useRef, useState } from "react";
import { Copy, X } from "lucide-react";

export type CitationPreview = { quote: string; title: string; text: string };

export default function PassageCitationDialog({ citation, onClose }: { citation: CitationPreview; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(citation.text);
      setManual("");
      setMessage("Citation copied.");
    } catch {
      setManual(citation.text);
      setMessage("Select and copy the text below.");
    }
  }
  return <dialog ref={dialog} className="passage-dialog passage-citation-dialog" aria-labelledby="citation-title" onCancel={onClose} onClose={onClose}>
    <header><h2 id="citation-title">Cite this passage</h2><button type="button" className="button" aria-label="Close citation" onClick={onClose}><X size={16} /></button></header>
    <div className="passage-dialog-body">
      <blockquote>{citation.quote}</blockquote>
      <p className="citation-source">{citation.title}</p>
      <div className="citation-actions">
        <button type="button" className="button primary" onClick={() => void copy()}><Copy size={15} aria-hidden="true" /> Copy citation</button>
      </div>
      <p className="small-text" role="status">{message}</p>
      {manual && <label>Copy manually<textarea readOnly value={manual} rows={5} onFocus={(event) => event.target.select()} /></label>}
      <p className="citation-help">Shared links open at this passage and highlight it for the reader.</p>
    </div>
  </dialog>;
}
