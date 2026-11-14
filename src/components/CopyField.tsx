import { useId, useState } from "react";
import "./copy-field.css";

export default function CopyField({
  label,
  value,
  onChange,
  placeholder,
  copyValue = value,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  copyValue?: string;
}) {
  const [copied, setCopied] = useState<{ value: string; message: string } | null>(null);
  const id = useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied({ value: copyValue, message: "Copied" });
    } catch {
      setCopied({ value: copyValue, message: "Select the value and copy it." });
    }
  }
  return (
    <div className="copy-field">
      <label htmlFor={id}>{label}</label>
      <div className="copy-field-controls">
        <input
          id={id}
          readOnly={!onChange}
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setCopied(null);
            onChange?.(event.target.value);
          }}
          onFocus={(event) => event.target.select()}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="button"
          aria-label={`Copy ${label.toLowerCase()}`}
          disabled={!copyValue}
          onClick={() => void copy()}
        >
          Copy
        </button>
      </div>
      {copied?.value === copyValue && (
        <span role="status" className="small-text">{copied.message}</span>
      )}
    </div>
  );
}
