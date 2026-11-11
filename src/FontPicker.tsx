import { Check,ChevronDown,Search,X } from "lucide-react";
import { useId,useRef,useState } from "react";
import { fontIds,typography,type BlogFont } from "../shared/typography";

export default function FontPicker({
  value,
  onChange,
}: {
  value: BlogFont;
  onChange: (font: BlogFont) => void;
}) {
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);
  const titleId = useId();
  const selected = typography[value] || typography.serif;
  const matches = fontIds.filter((id) =>
    `${typography[id].name} ${typography[id].description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const choose = (font: BlogFont) => {
    onChange(font);
    dialog.current?.close();
  };

  return (
    <div className="typography-controls">
      <h4>Typography</h4>
      <button
        type="button"
        className="font-picker-trigger"
        aria-label={`Change typeface, current: ${selected.name}`}
        aria-haspopup="dialog"
        onClick={() => {
          setQuery("");
          dialog.current?.showModal();
          search.current?.focus();
        }}
      >
        <span
          className="font-picker-sample"
          style={{ fontFamily: selected.family }}
        >
          Aa
        </span>
        <span className="font-picker-current">
          <strong>{selected.name}</strong>
          <small>{selected.description}</small>
        </span>
        <ChevronDown size={15} />
      </button>
      <dialog
        ref={dialog}
        className="font-picker-dialog"
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="font-picker-panel">
          <header>
            <div>
              <h2 id={titleId}>Choose a typeface</h2>
              <p>For your blog headings and articles.</p>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close typeface picker"
              onClick={() => dialog.current?.close()}
            >
              <X size={18} />
            </button>
          </header>
          <div className="font-picker-search">
            <Search size={16} />
            <input
              ref={search}
              aria-label="Search typefaces"
              placeholder="Search fonts or styles…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && matches.length) {
                  e.preventDefault();
                  options.current[0]?.focus();
                }
                if (e.key === "Enter" && matches.length) {
                  e.preventDefault();
                  choose(matches[0]);
                }
              }}
            />
          </div>
          <div
            className="font-picker-options"
            role="group"
            aria-label="Typefaces"
          >
            {matches.map((id, index) => (
              <button
                type="button"
                key={id}
                ref={(element) => {
                  options.current[index] = element;
                }}
                className="font-picker-option"
                aria-pressed={value === id}
                onClick={() => choose(id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const next = index + (e.key === "ArrowDown" ? 1 : -1);
                    if (next < 0) search.current?.focus();
                    else
                      options.current[
                        Math.min(next, matches.length - 1)
                      ]?.focus();
                  }
                }}
              >
                <span
                  className="font-picker-sample"
                  style={{ fontFamily: typography[id].family }}
                >
                  Aa
                </span>
                <span className="font-picker-current">
                  <strong>{typography[id].name}</strong>
                  <small>{typography[id].description}</small>
                </span>
                {value === id && <Check size={16} />}
              </button>
            ))}
            {!matches.length && (
              <p className="font-picker-empty">
                No typefaces found. Try a name or a style such as “handwriting”.
              </p>
            )}
          </div>
          <footer aria-live="polite">
            {matches.length} of {fontIds.length} typefaces
          </footer>
        </div>
      </dialog>
    </div>
  );
}
