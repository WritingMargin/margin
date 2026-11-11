import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import type { ExtraProps } from "react-markdown";
import type { ChecklistItem } from "../../shared/checklist";
import { useChecklistRegistration } from "./ChecklistHost";

type ChecklistState = { checked: boolean[]; toggle: (index: number) => void };
const ChecklistContext = createContext<ChecklistState | null>(null);

export default function Checklist({ title, floating, source, children }: { title: string; floating: boolean; source: string; children: ReactNode }) {
  const items = useMemo(() => JSON.parse(source) as ChecklistItem[], [source]);
  const initial = useMemo(() => items.map(item => item.checked), [items]);
  const [checked, setChecked] = useState(initial);
  const id = useId();
  const toggle = useCallback((index: number) => setChecked(current => current.map((value, at) => at === index ? !value : value)), []);
  const reset = useCallback(() => setChecked(initial), [initial]);
  const register = useChecklistRegistration();
  useEffect(() => {
    if (floating && items.length) register?.(id, { title, items, checked, toggle, reset });
  }, [register, floating, id, title, items, checked, toggle, reset]);
  useEffect(() => () => { register?.(id, null); }, [register, id]);
  return <ChecklistContext.Provider value={{ checked, toggle }}>
    <section className="interactive-checklist" aria-label={title}>
      <div className="checklist-heading"><strong>{title}</strong>{items.length > 0 && <span aria-live="polite">{checked.filter(Boolean).length}/{items.length} complete</span>}</div>
      {children}
      {items.length > 0 ? <button type="button" className="checklist-reset" onClick={reset}>Reset checklist</button> : <p>Add task items using <code>- [ ] Your task</code>.</p>}
      <small>Progress resets when you reload.</small>
    </section>
  </ChecklistContext.Provider>;
}

export function ChecklistInput({ node, ...props }: ComponentProps<"input"> & ExtraProps) {
  const state = useContext(ChecklistContext);
  const index = Number(node?.properties.dataChecklistItem);
  if (!state || !Number.isInteger(index) || index < 0 || index >= state.checked.length) return <input {...props} disabled />;
  return <input type="checkbox" aria-label={String(node?.properties.ariaLabel || `Checklist item ${index + 1}`)} checked={state.checked[index]} onChange={() => state.toggle(index)} />;
}
