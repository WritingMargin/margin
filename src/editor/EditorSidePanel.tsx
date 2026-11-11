import { useRef, type ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useMediaQuery } from "../useMediaQuery";
import { useOverlayFocus } from "../useOverlayFocus";
import { useSheetDrag } from "../ai/useSheetDrag";
import "../ai/writing.css";

export default function EditorSidePanel({
  id,
  label,
  icon,
  className = "",
  expanded,
  setExpanded,
  close,
  children,
}: {
  id: string;
  label: string;
  icon?: ReactNode;
  className?: string;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  close: () => void;
  children: ReactNode;
}) {
  const compact = useMediaQuery("(max-width: 1050px)");
  const panel = useRef<HTMLElement>(null);
  useOverlayFocus(panel, compact, close);
  const drag = useSheetDrag(panel, expanded, setExpanded, close);
  const sizeLabel = expanded ? "Reduce panel height" : "Expand panel height";
  return (
    <>
      {compact && (
        <button
          className="writing-sheet-backdrop"
          tabIndex={-1}
          aria-label={`Dismiss ${label}`}
          onClick={close}
        />
      )}
      <aside
        ref={panel}
        id={id}
        className={`writing-sidebar editor-button-surface ${className} ${expanded ? "sheet-expanded" : ""} ${drag.height === null ? "" : "sheet-dragging"}`}
        style={sheetStyle(drag.height)}
        role={compact ? "dialog" : "complementary"}
        aria-modal={compact || undefined}
        aria-label={label}
      >
        <button
          className="writing-sheet-grip"
          aria-label={sizeLabel}
          title="Swipe up to expand or down to close"
          {...drag.handlers}
        >
          <span />
        </button>
        <div className="writing-sidebar-bar">
          <span className="editor-panel-title">{icon}{label}</span>
          <div className="writing-sidebar-actions">
            <button
              className="icon-button writing-resize-button"
              title={sizeLabel}
              aria-label={sizeLabel}
              aria-pressed={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <SizeIcon expanded={expanded} />
            </button>
            <button
              className="icon-button"
              title={`Close ${label}`}
              aria-label={`Close ${label}`}
              onClick={close}
            >
              <X size={17} />
            </button>
          </div>
        </div>
        <div className="writing-sidebar-body">{children}</div>
      </aside>
    </>
  );
}
function SizeIcon({ expanded }: { expanded: boolean }) {
  return expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />;
}
function sheetStyle(height: number | null) {
  return height === null ? undefined : { height };
}
