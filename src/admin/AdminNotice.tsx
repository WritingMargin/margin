import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminController } from "./useAdminController";
type Props = {
  state: Pick<
    AdminController,
    | "conflicts"
    | "notice"
    | "noticeVersion"
    | "publishedNoticeId"
    | "post"
    | "openAI"
    | "setNotice"
  >;
};
export default function AdminNotice({ state }: Props) {
  const { notice, noticeVersion, publishedNoticeId, post, openAI, setNotice, conflicts } =
    state;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    // Keep draft recovery available until the author acts or dismisses it.
    if (!notice || hovered || focused || conflicts.canUndo) return;
    const timer = window.setTimeout(() => setNotice(""), 30000);
    return () => window.clearTimeout(timer);
  }, [notice, noticeVersion, hovered, focused, conflicts.canUndo, setNotice]);
  if (!notice) return null;
  return (
    <div role="status" className="notice"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}>
      <span>{notice}</span>
      {publishedNoticeId === post.id && post.status === "published" && (
        <button
          className="button publish-summary-action"
          onClick={() => openAI("social")}
        >
          <Sparkles size={14} />
          Generate summaries
        </button>
      )}
      {conflicts.canUndo && (
        <button className="button" onClick={conflicts.undo}>
          Recover my original draft
        </button>
      )}
      <button title="Dismiss" aria-label="Dismiss notification" onClick={() => {
        setHovered(false);
        setFocused(false);
        setNotice("");
      }}>
        <X size={15} />
      </button>
    </div>
  );
}
