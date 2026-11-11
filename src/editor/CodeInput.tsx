import { useId, useMemo, useRef, type KeyboardEvent } from "react";
import { codeLanguageLabel } from "../../shared/code-languages";
import { highlightCode } from "../code/highlight";
import { indentCode, tabCode } from "./code-indent";
export default function CodeInput({
  value,
  language,
  onChange,
}: {
  value: string;
  language: string;
  onChange: (value: string) => void;
}) {
  const highlighted = useMemo(
    () => highlightCode(value, language),
    [value, language],
  );
  const preview = useRef<HTMLPreElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const leaveWithTab = useRef(false);
  const helpId = useId();
  function indent(outdent: boolean, tab = false) {
    const element = input.current;
    if (!element) return;
    const next = (tab ? tabCode : indentCode)(
      value,
      element.selectionStart,
      element.selectionEnd,
      outdent,
    );
    onChange(next.content);
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(next.start, next.end);
    });
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.nativeEvent.isComposing
    )
      return;
    if (event.key === "Escape") {
      // Consume Escape before the dialog's native listener closes the editor.
      event.preventDefault();
      event.stopPropagation();
      leaveWithTab.current = true;
      return;
    }
    const leave = leaveWithTab.current;
    leaveWithTab.current = false;
    if (event.key !== "Tab" || leave) return;
    event.preventDefault();
    event.stopPropagation();
    indent(event.shiftKey, true);
  }
  return (
    <>
      <div
        className="code-input-actions"
        role="group"
        aria-label="Code indentation"
      >
        <button className="button" type="button" onClick={() => indent(false)}>
          Indent
        </button>
        <button className="button" type="button" onClick={() => indent(true)}>
          Outdent
        </button>
      </div>
      <div className="code-input">
        <pre ref={preview} aria-hidden="true">
          <code
            className="code-highlight"
            dangerouslySetInnerHTML={{ __html: highlighted.html + "\n" }}
          />
        </pre>
        <textarea
          ref={input}
          aria-label="Code content"
          aria-describedby={helpId}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          value={value}
          onKeyDownCapture={keyDown}
          onBlur={() => {
            leaveWithTab.current = false;
          }}
          onChange={(event) => onChange(event.target.value)}
          onScroll={(event) => {
            if (preview.current) {
              preview.current.scrollTop = event.currentTarget.scrollTop;
              preview.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
        />
      </div>
      <p id={helpId} className="small-text">
        Tab indents; Shift+Tab outdents. Press Escape, then Tab to leave the
        code field.
      </p>
      <p className="small-text" role="status">
        {language === "auto" ? "Detected: " : "Language: "}
        {codeLanguageLabel(highlighted.language)}
      </p>
    </>
  );
}
