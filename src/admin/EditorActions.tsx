import { useTeamIdentity } from "../auth/TeamContext";
import { contentTypeLabel } from "../../shared/content-types";
import { useEffect, useId, useRef, useState } from "react";
import { History, Lightbulb, MoreHorizontal, SlidersHorizontal, Sparkles } from "lucide-react";
import type { AdminController } from "./useAdminController";
import { date } from "./post-utils";
import "./editor-actions.css";

type State = Pick<AdminController, "post" | "theme" | "setModal" | "openAI" | "writing">;
export default function EditorActions({ state }: { state: State }) {
  const { post, setModal, openAI, writing } = state;
  const { role } = useTeamIdentity();
  const label = contentTypeLabel(post.contentType, state.theme.publicationType);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function select(action: () => void) {
    setOpen(false);
    trigger.current?.focus();
    action();
  }
  return (
    <div className="editor-actions" ref={root} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }}>
      <button ref={trigger} className="editor-actions-trigger" aria-label={`${label} options`} aria-describedby={`${id}-tip`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      <span id={`${id}-tip`} role="tooltip" className="editor-actions-tooltip">{label} options</span>
      {open && <div id={id} className="editor-actions-panel" role="group" aria-label={`${label} options`}>
        <button onClick={() => select(() => setModal("details"))}><SlidersHorizontal size={16} aria-hidden="true" />{label} details</button>
        {role === "owner" && <button aria-expanded={writing.open} aria-controls="writing-companion" onClick={() => select(() => writing.setOpen(!writing.open))}><Lightbulb size={16} aria-hidden="true" />{writing.open ? "Close writing assistant" : "Writing assistant"}</button>}
        {role === "owner" && post.status === "published" && <button onClick={() => select(() => openAI("social"))}><Sparkles size={16} aria-hidden="true" />Social summaries</button>}
        {post.id && <button onClick={() => select(() => setModal("history"))}><History size={16} aria-hidden="true" />Revision history</button>}
        {post.id && <p>Updated {date(post.updatedAt)}</p>}
      </div>}
    </div>
  );
}
