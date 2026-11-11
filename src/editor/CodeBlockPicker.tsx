import type { WriterEditor } from "./editor-handle";
import Select from "../components/Select";
import { useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Code2, FileUp, X } from "lucide-react";
import { useOverlayFocus } from "../useOverlayFocus";
import {
  codeLanguage,
  codeLanguageLabel,
  codeLanguages,
} from "../../shared/code-languages";
import { highlightCode } from "../code/highlight";
import { codeNoWrap, codeWrapMeta } from "../code/code-wrap";
import { selectedCode, replaceCode, type CodeSelection } from "./code-blocks";
import CodeInput from "./CodeInput";
import { parseNotebook } from "../../shared/notebook";
import "../admin/dialog-layout.css";
import "../code/code.css";
type Props = {
  editor: RefObject<WriterEditor | null>;
  content: string;
  onChange: (content: string) => void;
};
export default function CodeBlockPicker(props: Props) {
  const [selection, setSelection] = useState<CodeSelection | null>(null);
  function open() {
    const editor = props.editor.current;
    if (editor)
      setSelection(
        selectedCode(props.content, editor.selectionStart, editor.selectionEnd),
      );
  }
  return (
    <>
      <button
        type="button"
        onClick={open}
        title="Insert or edit code block"
        aria-label="Insert or edit code block"
      >
        <Code2 size={16} aria-hidden="true" /> Code block
      </button>
      {selection &&
        createPortal(
          <CodeDialog
            {...props}
            selection={selection}
            close={() => setSelection(null)}
          />,
          document.body,
        )}
    </>
  );
}
function CodeDialog({
  editor,
  content,
  onChange,
  selection,
  close,
}: Props & { selection: CodeSelection; close: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlayFocus(panel, true, close);
  const [source, setSource] = useState(selection.source);
  const [language, setLanguage] = useState(codeLanguage(selection.language));
  const [nowrap, setNoWrap] = useState(codeNoWrap(selection.meta));
  const [error, setError] = useState(selection.error || "");
  const [reading, setReading] = useState(false);
  function apply() {
    try {
      const chosen =
        language === "auto" ? highlightCode(source).language : language;
      if (chosen === "ipynb") parseNotebook(source);
      const next = replaceCode(
        content,
        { ...selection, meta: codeWrapMeta(selection.meta, nowrap) },
        source,
        chosen,
      );
      onChange(next.content);
      close();
      requestAnimationFrame(() => {
        editor.current?.focus();
        editor.current?.setSelectionRange(next.start, next.end);
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const known =
    language === "auto" || codeLanguages.some(([id]) => id === language);
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal code-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="code-dialog-title"
        ref={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="code-dialog-title">
            {selection.existing ? "Edit code block" : "Insert code block"}
          </h2>
          <button
            className="modal-close"
            type="button"
            onClick={close}
            aria-label="Close code editor"
          >
            <X size={18} />
          </button>
        </header>
        <div className="dialog-body">
          <label>
            Code language
            <Select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="auto">Detect automatically</option>
              {!known && (
                <option value={language}>{codeLanguageLabel(language)}</option>
              )}
              {codeLanguages.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          {language === "ipynb" && (
            <NotebookImport
              onSource={setSource}
              onError={setError}
              onReading={setReading}
              reading={reading}
            />
          )}
          {language !== "ipynb" && (
            <label className="code-wrap-option">
              <input
                type="checkbox"
                checked={nowrap}
                onChange={(event) => setNoWrap(event.target.checked)}
              />
              Keep lines unwrapped (allow horizontal scrolling)
            </label>
          )}
          <p className="small-text">{codeHelpText(language)}</p>
          <CodeInput
            value={source}
            language={codeInputLanguage(language)}
            onChange={setSource}
          />
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            onClick={apply}
            disabled={!!selection.error || reading}
          >
            {selection.existing ? "Apply changes" : "Insert code"}
          </button>
        </footer>
      </div>
    </div>
  );
}
function codeHelpText(language: string) {
  return language === "ipynb"
    ? "Import a notebook or paste its .ipynb JSON below. Its cells and saved outputs will appear in the article."
    : "Paste your code below. Indentation is preserved. Choose a language if the detected one is incorrect.";
}
function codeInputLanguage(language: string) {
  return language === "ipynb" ? "json" : language;
}
function NotebookImport({
  onSource,
  onError,
  onReading,
  reading,
}: {
  onSource: (source: string) => void;
  onError: (error: string) => void;
  onReading: (reading: boolean) => void;
  reading: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  async function importFile(file: File) {
    onReading(true);
    onError("");
    try {
      const source = await file.text();
      parseNotebook(source);
      onSource(source);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      onReading(false);
    }
  }
  return (
    <div className="code-notebook-import">
      <input
        ref={input}
        type="file"
        accept=".ipynb"
        aria-label="Jupyter notebook file"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      <button
        className="button"
        type="button"
        disabled={reading}
        onClick={() => input.current?.click()}
      >
        <FileUp size={16} aria-hidden="true" />
        {reading ? "Reading notebook…" : "Import .ipynb file"}
      </button>
      <p className="small-text">Jupyter version 4 · Up to 1.5 MB</p>
    </div>
  );
}
