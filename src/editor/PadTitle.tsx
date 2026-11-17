import { useLayoutEffect, useRef, type KeyboardEvent, type Ref } from "react";

type Props = {
  value: string;
  label: string;
  placeholder: string;
  className: string;
  onChange: (value: string) => void;
  /** Enter, or ArrowDown at the end, moves on (to the subtitle or the body). */
  onNext: () => void;
  fieldRef?: Ref<HTMLTextAreaElement>;
};

/** A single-line, auto-growing field at the top of the pad: the title or the subtitle. */
export default function PadTitle({ value, label, placeholder, className, onChange, onNext, fieldRef }: Props) {
  const field = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" && event.key !== "ArrowDown") return;
    const atEnd = field.current?.selectionStart === value.length;
    if (event.key === "ArrowDown" && !atEnd) return;
    event.preventDefault();
    onNext();
  }

  function setRef(el: HTMLTextAreaElement | null) {
    field.current = el;
    if (typeof fieldRef === "function") fieldRef(el);
    else if (fieldRef) (fieldRef as { current: HTMLTextAreaElement | null }).current = el;
  }

  return (
    <textarea
      ref={setRef}
      className={className}
      aria-label={label}
      placeholder={placeholder}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, " "))}
      onKeyDown={onKeyDown}
    />
  );
}
