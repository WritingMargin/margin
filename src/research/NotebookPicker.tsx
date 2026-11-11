import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { notebookBlock } from "../../shared/notebook";

export default function NotebookPicker({
  insert,
}: {
  insert: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function embed(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (file.size > 1_500_000)
        throw new Error(
          "Use a notebook under 1.5 MB. Clear large outputs and try again.",
        );
      insert(notebookBlock(await file.text()));
      setMessage("Notebook inserted into your draft.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="research-notebook">
      <h3>Jupyter notebook</h3>
      <p>Embed code, data, and saved outputs from a Jupyter notebook.</p>
      <input
        ref={input}
        aria-label="Notebook file"
        hidden
        disabled={busy}
        type="file"
        accept=".ipynb"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void embed(file);
        }}
      />
      <button
        className="button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        <FileUp size={14} aria-hidden="true" />
        {busy ? "Reading…" : "Embed .ipynb file"}
      </button>
      <p className="research-muted">Jupyter v4 · Up to 1.5 MB</p>
      <span role="status">{message}</span>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
