import { useEffect, useState, type RefObject } from "react";
import { StickyNote } from "lucide-react";
import { passageRange } from "../blog/passage-anchors";
import type { ReviewNote } from "./types";

type Rect = { top: number; left: number; width: number; height: number };
type Mark = { ids: string[]; top: number; rects: Rect[]; quote: string };
export default function ReviewMarkers({
  content,
  notes,
}: {
  content: RefObject<HTMLDivElement | null>;
  notes: ReviewNote[];
}) {
  const [marks, setMarks] = useState<Mark[]>([]);
  useEffect(() => {
    const node = content.current;
    if (!node) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setMarks(measureNotes(node, notes)));
    };
    const resize = new ResizeObserver(schedule);
    const changes = new MutationObserver(schedule);
    resize.observe(node);
    changes.observe(node, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      changes.disconnect();
    };
  }, [content, notes]);
  return (
    <>
      <div className="passage-marks" aria-hidden="true">
        {marks.map((mark) => (
          <span key={mark.ids[0]}>
            {mark.rects.map((rect, i) => (
              <span key={i} className="passage-highlight" style={rect} />
            ))}
          </span>
        ))}
      </div>
      {marks.map((mark) => (
        <button
          type="button"
          className="passage-bubble peer-marker"
          style={{ top: mark.top }}
          key={mark.ids[0]}
          aria-label={`Read ${mark.ids.length} review ${mark.ids.length === 1 ? "note" : "notes"} on this passage: ${mark.quote}`}
          onClick={() =>
            document.getElementById("review-note-" + mark.ids[0])?.focus()
          }
        >
          <StickyNote size={13} />
          {mark.ids.length}
        </button>
      ))}
    </>
  );
}
function measureNotes(root: HTMLElement, notes: ReviewNote[]): Mark[] {
  const bounds = root.getBoundingClientRect();
  const marks = new Map<string, Mark>();
  for (const note of notes) {
    if (note.anchorStatus === "earlier") continue;
    const key = note.occurrence + "\n" + note.quote;
    const existing = marks.get(key);
    if (existing) {
      existing.ids.push(note.id);
      continue;
    }
    const range = passageRange(root, note.quote, note.occurrence);
    if (!range) continue;
    const rects = Array.from(range.getClientRects(), (rect) => ({
      top: rect.top - bounds.top,
      left: rect.left - bounds.left,
      width: rect.width,
      height: rect.height,
    }));
    if (rects.length)
      marks.set(key, {
        ids: [note.id],
        quote: note.quote,
        top: rects[0].top,
        rects,
      });
  }
  return Array.from(marks.values());
}
