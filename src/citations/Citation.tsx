import { useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, Expand, X } from "lucide-react";
import {
  citationTarget,
  documentPath,
  type Citation as Source,
} from "../../shared/citations";
import { ReviewInviteContext } from "./review-context";
import { sitePath } from "../base-path";
import "./citations.css";

export default function Citation({
  source,
  children,
}: {
  source: Source;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    arrow: 24,
    above: false,
  });
  const trigger = useRef<HTMLAnchorElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const raw = citationTarget(source);
  const invite=useContext(ReviewInviteContext);
  const href = sourceHref(raw,invite);
  const close = () => {
    setOpen(false);
    setExpanded(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = trigger.current!.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      const left = Math.max(
        12,
        Math.min(bounds.left, window.innerWidth - width - 12),
      );
      const height = popup.current?.offsetHeight || 250;
      const above =
        bounds.bottom + height + 16 > window.innerHeight &&
        bounds.top > height + 16;
      setPosition({
        left,
        top: above
          ? bounds.top - height - 12
          : Math.min(
              bounds.bottom + 12,
              Math.max(12, window.innerHeight - height - 12),
            ),
        arrow: Math.max(
          18,
          Math.min(
            width - 18,
            bounds.left + Math.min(bounds.width / 2, 40) - left,
          ),
        ),
        above,
      });
    };
    const dismiss = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      ) {
        setOpen(false);
        setExpanded(false);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (expanded) trapCitationFocus(event, popup.current);
    };
    place();
    popup.current?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, expanded]);
  if (!href) return <>{children}</>;
  const host = documentPath.test(source.url)
    ? "PDF document"
    : new URL(source.url).hostname;
  return (
    <>
      <a
        className="citation-mark"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        ref={trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
          event.preventDefault();
          setOpen(!open);
          setExpanded(false);
        }}
      >
        {children}
        <sup aria-hidden="true">↗</sup>
      </a>
      {open &&
        createPortal(
          <>
            {expanded && <div className="citation-backdrop" onClick={close} />}
            <div
              id={id}
              ref={popup}
              tabIndex={-1}
              role="dialog"
              aria-label={citationTitle(source)}
              aria-modal={expanded}
              className={`citation-bubble ${expanded ? "is-expanded" : ""} ${position.above ? "is-above" : ""}`}
              style={
                expanded
                  ? undefined
                  : ({
                      left: position.left,
                      top: position.top,
                      "--citation-arrow": `${position.arrow}px`,
                    } as React.CSSProperties)
              }
            >
              <CitationContent
                source={source}
                host={host}
                href={href}
                expanded={expanded}
                close={close}
                toggle={() => setExpanded(!expanded)}
              />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

function CitationContent({
  source,
  host,
  href,
  expanded,
  close,
  toggle,
}: {
  source: Source;
  host: string;
  href: string;
  expanded: boolean;
  close: () => void;
  toggle: () => void;
}) {
  return (
    <>
      <div className="citation-topline">
        <span>SOURCE{source.page ? ` · PAGE ${source.page}` : ""}</span>
        <button aria-label="Close citation" onClick={close}>
          <X size={15} />
        </button>
      </div>
      <strong className="citation-title">{source.title || host}</strong>
      <span className="citation-host">{host}</span>
      <blockquote className={expanded ? "" : "citation-excerpt"}>
        {source.quote}
      </blockquote>
      <div className="citation-actions">
        <button onClick={toggle}>
          <Expand size={14} />
          {expanded ? "Collapse" : "Expand"}
        </button>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {source.page || documentPath.test(source.url)
            ? "Open PDF"
            : "View passage"}
          <ArrowUpRight size={14} />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </>
  );
}

function citationTitle(source: Source) {
  return source.title || "Source citation";
}

function trapCitationFocus(event: KeyboardEvent, popup: HTMLDivElement | null) {
  if (event.key !== "Tab" || !popup) return;
  const controls = popup.querySelectorAll<HTMLElement>("button, a[href]");
  if (!controls.length) return;
  const edge = event.shiftKey ? controls[0] : controls[controls.length - 1];
  if (document.activeElement === edge || document.activeElement === popup) {
    event.preventDefault();
    controls[event.shiftKey ? controls.length - 1 : 0].focus();
  }
}

function sourceHref(target:string,invite:string){
 if (!target.startsWith("/")) return target;
 const path=sitePath(target);
 return invite ? path+"&review="+encodeURIComponent(invite) : path;
}
