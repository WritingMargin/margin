import { useId, useRef, type KeyboardEvent, type CSSProperties } from "react";
import "./inner-tabs.css";

export interface InnerTab<Value extends string> {
  value: Value;
  label: string;
  shortLabel?: string;
  count?: number;
}

export default function InnerTabs<Value extends string>({
  label,
  tabs,
  value,
  onChange,
  idPrefix,
  panelId,
  numbered = true,
}: {
  label: string;
  tabs: readonly InnerTab<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  idPrefix?: string;
  panelId?: (value: Value) => string;
  numbered?: boolean;
}) {
  const generatedId = useId();
  const prefix = idPrefix ?? generatedId;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function keydown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].value);
    buttons.current[next]?.focus();
  }
  return (
    <div className="inner-tabs-container">
      <div
        className="inner-tabs"
        role="tablist"
        aria-label={label}
        data-count={tabs.length}
        style={{ "--inner-tab-count": tabs.length } as CSSProperties}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${prefix}-${tab.value}`}
            aria-label={
              tab.count === undefined
                ? tab.label
                : `${tab.label} (${tab.count})`
            }
            aria-controls={panelId?.(tab.value)}
            aria-selected={tab.value === value}
            tabIndex={tab.value === value ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => keydown(event, index)}
          >
            {numbered && (
              <span className="inner-tab-number" aria-hidden="true">
                {index + 1}
              </span>
            )}
            <span className="inner-tab-label-long">{tab.label}</span>
            <span className="inner-tab-label-short">
              {tab.shortLabel ?? tab.label}
            </span>
            {tab.count !== undefined && (
              <span className="inner-tab-count" aria-hidden="true">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
