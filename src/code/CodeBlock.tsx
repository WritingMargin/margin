import { useEffect, useMemo, useState } from "react";
import Notebook from "../blocks/Notebook";
import { Check, Copy } from "lucide-react";
import { highlightCode } from "./highlight";
import { codeLanguageLabel } from "../../shared/code-languages";
import "./code.css";
type CodeProps = { source: string; language: string; nowrap?: boolean };
export default function CodeBlock(props: CodeProps) {
  return props.language === "ipynb" ? (
    <Notebook source={props.source} />
  ) : (
    <HighlightedCode {...props} />
  );
}
function HighlightedCode({ source, language, nowrap = false }: CodeProps) {
  const highlighted = useMemo(
    () => highlightCode(source, language || "auto"),
    [source, language],
  );
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return;
    const timer = setTimeout(() => setStatus(""), 30000);
    return () => clearTimeout(timer);
  }, [status]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setStatus("Copied");
    } catch {
      setStatus("Select the code to copy it.");
    }
  }
  return (
    <div className={nowrap ? "code-block code-block-nowrap" : "code-block"}>
      <div className="code-block-heading">
        <span>{codeLanguageLabel(highlighted.language)}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy code"
        >
          {status === "Copied" ? <Check size={14} /> : <Copy size={14} />} Copy
        </button>
      </div>
      <pre>
        <code
          className="code-highlight"
          dangerouslySetInnerHTML={{ __html: highlighted.html }}
        />
      </pre>
      {status && (
        <span className="code-copy-status" role="status">
          {status}
        </span>
      )}
    </div>
  );
}
