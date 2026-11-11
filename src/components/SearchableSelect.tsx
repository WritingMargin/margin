import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, Check } from "lucide-react";
import "./searchable-select.css";

type Option = { value: string; label: string };
type Props = { label: string; placeholder: string; searchLabel: string; value: string; options: Option[]; disabled?: boolean; onChange: (value: string) => void };

export default function SearchableSelect({ label, placeholder, searchLabel, value, options, disabled, onChange }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const filtered = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (option: Option) => { onChange(option.value); close(); };
  const move = (direction: number) => setActive(current => Math.max(0, Math.min(filtered.length - 1, current + direction)));
  const keyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); move(1); break;
      case "ArrowUp": event.preventDefault(); move(-1); break;
      case "Enter": event.preventDefault(); if (filtered[active]) choose(filtered[active]); break;
      case "Escape": event.preventDefault(); close(); break;
    }
  };
  return <div className="searchable-select" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
    <button ref={trigger} id={`${id}-trigger`} className="searchable-select-trigger" type="button" disabled={disabled} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setQuery(""); setActive(0); setOpen(current => !current); }}>
      <span id={`${id}-value`}>{options.find(option => option.value === value)?.label ?? placeholder}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="searchable-select-popup">
      <input autoFocus role="combobox" aria-label={searchLabel} aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined} placeholder={searchLabel} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={keyboard} />
      <div id={`${id}-list`} role="listbox" aria-label={label} className="searchable-select-options">
        {filtered.map((option, index) => <SearchOption key={option.value} id={`${id}-option-${index}`} option={option} selected={option.value === value} active={active === index} choose={choose} />)}
      </div>
      {!filtered.length && <p role="status">No matching videos.</p>}
    </div>}
  </div>;
}

function SearchOption({ id, option, selected, active, choose }: { id: string; option: Option; selected: boolean; active: boolean; choose: (option: Option) => void }) {
  return <button ref={element => { if (active) element?.scrollIntoView({ block: "nearest" }); }} id={id} type="button" role="option" aria-selected={selected} tabIndex={-1} className={active ? "is-active" : ""} onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
    <span>{option.label}</span>{selected && <Check size={16} aria-hidden="true" />}
  </button>;
}
