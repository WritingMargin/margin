import { useEffect, useRef } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { contentTypes, contentTypeLabel, type ContentType } from "../../shared/content-types";
import type { PublicationType } from "../../shared/publication";
import "./new-content-menu.css";

export default function NewContentMenu({ onCreate, publicationType, sidebar = false }: {
  onCreate: (type: ContentType) => void;
  publicationType: PublicationType;
  sidebar?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (details.current && !container.current?.contains(event.target as Node)) details.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const create = (type: ContentType) => {
    if (details.current) details.current.open = false;
    onCreate(type);
  };
  return <div ref={container} className={`new-content-menu${sidebar ? " sidebar-create" : ""}`} onBlur={event => {
    if (details.current && !event.currentTarget.contains(event.relatedTarget)) details.current.open = false;
  }} onKeyDown={event => {
    if (event.key === "Escape" && details.current?.open) { event.preventDefault(); details.current.open = false; details.current.querySelector("summary")?.focus(); }
  }}>
    <button type="button" className="button primary new-content-default" onClick={() => create("article")}>
      <Plus size={16} /> New {contentTypeLabel("article", publicationType).toLowerCase()}
    </button>
    <details ref={details}>
      <summary className="button primary" aria-label="More content types"><ChevronDown size={14} /></summary>
      <div className="new-content-options" aria-label="Create content">
        {contentTypes.filter(type => type.id !== "article").map(type => <button type="button" className="button" key={type.id} onClick={() => create(type.id)}>
          <Plus size={16} /> New {contentTypeLabel(type.id, publicationType).toLowerCase()}
        </button>)}
      </div>
    </details>
  </div>;
}
