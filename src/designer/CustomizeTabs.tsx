import { useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent } from "react";

const tabs = ["Layout", "Content", "Style"] as const;
export default function CustomizeTabs({ layout, content, style }: { layout: ReactNode; content: ReactNode; style: ReactNode }) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    list.current?.scrollIntoView({ block: "nearest" });
  }, []);
  const [active, setActive] = useState(0);
  const panels = [layout, content, style];
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = tabIndex(event.key, index);
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  return <div className="customize-sections">
    <div ref={list} className="customize-tabs" role="tablist" aria-label="Customize settings">
      {tabs.map((name, index) => <button key={name} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={event => navigate(event, index)}>{name}</button>)}
    </div>
    {panels.map((panel, index) => <div key={tabs[index]} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={active !== index}>{panel}</div>)}
  </div>;
}

function tabIndex(key: string, index: number) {
  if (key === "Home") return 0;
  if (key === "End") return tabs.length - 1;
  if (key === "ArrowRight") return (index + 1) % tabs.length;
  if (key === "ArrowLeft") return (index + tabs.length - 1) % tabs.length;
}
