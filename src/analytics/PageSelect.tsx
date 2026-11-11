import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search, ChevronDown } from "lucide-react";

export default function PageSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; title: string; slug?: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const all = [
    { id: "", title: "All pages" },
    { id: "home", title: "Homepage" },
    ...options,
  ];
  const matches = all.filter((option) =>
    `${option.title} ${option.slug || ""}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const results = matches.slice(0, 50);
  const title = all.find((option) => option.id === value)?.title || "All pages";
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [id, active, open]);
  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }
  function reveal() {
    setOpen(true);
    setQuery("");
    setActive(0);
  }
  function keydown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        event.stopPropagation();
      }
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      if (results[active]) choose(results[active].id);
      return;
    }
    const direction = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    setOpen(true);
    setActive((index) =>
      Math.max(0, Math.min(results.length - 1, index + direction)),
    );
  }
  return (
    <div
      className="analytics-page-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id}>Page</label>
      <div className="analytics-search-select">
        <Search size={14} aria-hidden="true" />
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && results.length ? `${id}-option-${active}` : undefined
          }
          autoComplete="off"
          placeholder="Search all content…"
          value={open ? query : title}
          onFocus={reveal}
          onClick={() => {
            if (!open) reveal();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={keydown}
        />
        <ChevronDown size={12} aria-hidden="true" />
      </div>
      {open && (
        <div className="analytics-select-menu">
          <ul role="listbox" id={`${id}-options`} aria-label="Pages">
            {results.map((option, index) => (
              <li
                role="option"
                id={`${id}-option-${index}`}
                aria-selected={option.id === value}
                key={option.id}
                className={index === active ? "is-active" : ""}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.id)}
              >
                {option.title}
                {option.slug && <small>/post/{option.slug}</small>}
              </li>
            ))}
          </ul>
          {!results.length && <p role="status">No matching pages.</p>}
          {matches.length > 50 && (
            <p>Showing 50 matches. Keep typing to narrow the list.</p>
          )}
        </div>
      )}
    </div>
  );
}
