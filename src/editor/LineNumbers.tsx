import { useEffect, useRef, type RefObject } from "react";

export default function LineNumbers({ editorRef, value }: {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const editor = editorRef.current;
    const numbers = gutter.current;
    if (!editor || !numbers) return;
    const measure = () => {
      if (!editor.clientWidth) return;
      const style = getComputedStyle(editor);
      const mirror = document.createElement("div");
      for (const property of ["font", "letter-spacing", "line-height", "white-space", "word-break", "overflow-wrap", "tab-size"]) {
        mirror.style.setProperty(property, style.getPropertyValue(property));
      }
      Object.assign(mirror.style, {
        position: "fixed", visibility: "hidden", pointerEvents: "none",
        left: "0", top: "0",
        width: `${editor.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`,
      });
      // A logical line can occupy several visual rows after wrapping.
      for (const line of value.split("\n")) {
        const row = document.createElement("div");
        row.textContent = line || "\u200b";
        mirror.append(row);
      }
      document.body.append(mirror);
      const heights = Array.from(mirror.children, row => row.getBoundingClientRect().height);
      mirror.remove();
      Array.from(numbers.children).forEach((row, index) => {
        (row as HTMLElement).style.minHeight = `${heights[index]}px`;
      });
      numbers.style.transform = `translateY(-${editor.scrollTop}px)`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(editor);
    let active = true;
    void document.fonts.ready.then(() => { if (active) measure(); });
    return () => { active = false; observer.disconnect(); };
  }, [editorRef, value]);
  return <div ref={gutter} className="line-numbers" aria-hidden="true">
    {value.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}
  </div>;
}
