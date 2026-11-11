import type { WriterEditor } from "./editor-handle";
import Select from "../components/Select";
import type { RefObject } from "react";
import { applyHeading } from "./headings";
import "./headings.css";

export default function HeadingPicker({
  editor,
  content,
  onChange,
}: {
  editor: RefObject<WriterEditor | null>;
  content: string;
  onChange: (content: string) => void;
}) {
  function apply(level: number) {
    const field = editor.current;
    if (!field) return;
    const next = applyHeading(
      content,
      field.selectionStart,
      field.selectionEnd,
      level,
    );
    onChange(next.content);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(next.start, next.end);
    });
  }
  return (
    <div className="heading-picker">
      <Select
        aria-label="Heading level"
        title="Heading level"
        value=""
        onChange={(event) => apply(Number(event.target.value))}
      >
        <option value="" disabled>
          Heading
        </option>
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <option key={level} value={level}>
            H{level} — Heading {level}
          </option>
        ))}
        <option value="0">Paragraph</option>
      </Select>
    </div>
  );
}
