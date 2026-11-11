import type { WritingView } from "../../shared/writing";

const views: [WritingView, string][] = [
  ["brief", "Chat"],
  ["saved", "Saved insights"],
];
export function WritingViewSwitch({
  view,
  setView,
}: {
  view: WritingView;
  setView: (view: WritingView) => void;
}) {
  return (
    <div
      className="assistant-navigation"
      role="group"
      aria-label="Assistant view"
    >
      {views.map(([key, label]) => (
        <button
          type="button"
          key={key}
          aria-pressed={view === key}
          onClick={() => setView(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
