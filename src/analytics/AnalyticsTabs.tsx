import type { KeyboardEvent } from "react";
import ScrollTabs from "../components/ScrollTabs";
import { analyticsGroups, type AnalyticsGroup } from "./groups";

export default function AnalyticsTabs({
  value,
  onChange,
}: {
  value: AnalyticsGroup;
  onChange: (value: AnalyticsGroup) => void;
}) {
  function arrowNavigation(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const next = {
      ArrowRight: (index + 1) % analyticsGroups.length,
      ArrowLeft: (index + analyticsGroups.length - 1) % analyticsGroups.length,
      Home: 0,
      End: analyticsGroups.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(analyticsGroups[next]);
    document
      .getElementById(`analytics-group-${analyticsGroups[next]}`)
      ?.focus();
  }
  return (
    <ScrollTabs
      className="settings-tabs analytics-tabs"
      role="tablist"
      label="Analytics views"
    >
      {analyticsGroups.map((group, index) => (
        <button
          type="button"
          role="tab"
          key={group}
          id={`analytics-group-${group}`}
          aria-controls={`analytics-group-panel-${group}`}
          aria-selected={value === group}
          tabIndex={value === group ? 0 : -1}
          onClick={() => onChange(group)}
          onKeyDown={(event) => arrowNavigation(event, index)}
        >
          {group[0].toUpperCase() + group.slice(1)}
        </button>
      ))}
    </ScrollTabs>
  );
}
