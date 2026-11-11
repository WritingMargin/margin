import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from "react";
import type { ChecklistItem } from "../../shared/checklist";
import "./checklist.css";

export interface FloatingChecklist {
  title: string;
  items: ChecklistItem[];
  checked: boolean[];
  toggle: (index: number) => void;
  reset: () => void;
}
const RegisterContext = createContext<((id: string, value: FloatingChecklist | null) => void) | null>(null);
export const useChecklistRegistration = () => useContext(RegisterContext);

export function ChecklistHost({ children, enabled = false }: { children: ReactNode; enabled?: boolean }) {
  const [entries, setEntries] = useState<Record<string, FloatingChecklist>>({});
  const register = useCallback((id: string, value: FloatingChecklist | null) => {
    setEntries(current => {
      if (value) return { ...current, [id]: value };
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);
  return <RegisterContext.Provider value={enabled ? register : null}>
    {children}
    {enabled && Object.keys(entries).length > 0 && <ChecklistDock entries={entries} />}
  </RegisterContext.Provider>;
}

function ChecklistDock({ entries }: { entries: Record<string, FloatingChecklist> }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const ids = Object.keys(entries);
  const active = selected in entries ? selected : ids[0];
  const entry = entries[active];
  const completed = entry.checked.filter(Boolean).length;
  function minimize() { setOpen(false); trigger.current?.focus(); }
  return <aside className="checklist-dock" aria-label="Floating checklist" onKeyDown={event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); minimize(); }
  }}>
    <button type="button" ref={trigger} className="checklist-dock-toggle" aria-label={open ? "Minimize floating checklist" : "Open floating checklist"} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span>{entry.title}</span><span>{completed}/{entry.items.length} {open ? "−" : "+"}</span>
    </button>
    <div id={panelId} hidden={!open} className="checklist-dock-panel">
      {ids.length > 1 && <label className="checklist-chooser">Choose checklist<select value={active} onChange={event => setSelected(event.target.value)}>
        {ids.map((id, index) => <option key={id} value={id}>{index + 1}. {entries[id].title}</option>)}
      </select></label>}
      <p className="checklist-progress" aria-live="polite">{completed} of {entry.items.length} complete</p>
      <ul className="checklist-dock-items">{entry.items.map((item, index) => <li key={index}>
        <label><input type="checkbox" checked={entry.checked[index]} onChange={() => entry.toggle(index)} /><span>{item.label}</span></label>
      </li>)}</ul>
      <div className="checklist-dock-actions">
        <button type="button" onClick={entry.reset}>Reset checklist</button>
        <button type="button" onClick={minimize}>Minimize</button>
      </div>
      <small>Progress resets when you reload.</small>
    </div>
  </aside>;
}
