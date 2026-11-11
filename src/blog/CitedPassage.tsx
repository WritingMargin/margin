import { useEffect, useState, type RefObject } from "react";
import { Quote, X } from "lucide-react";
import { passageRange, passageText } from "./passage-anchors";
import { parsePassageCitation, resolveCitationOccurrence, type PassageCitation } from "./passage-citation";

type Rect = { left: number; top: number; width: number; height: number };

export default function CitedPassage({ content, root, postID, revision }: {
  content: RefObject<HTMLElement | null>;
  root: RefObject<HTMLElement | null>;
  postID: string;
  revision?: string;
}) {
  const [citation, setCitation] = useState<PassageCitation | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  useEffect(() => {
    const read = () => setCitation(parsePassageCitation(window.location.hash));
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, [postID]);
  useEffect(() => {
    setRects([]);
    if (!citation || !content.current || !root.current) return;
    return trackCitation(content.current, root.current, citation, revision, setRects);
  }, [citation, content, root, postID, revision]);
  if (!citation) return null;
  return <>
    <div className="passage-marks cited-passage-marks" aria-hidden="true">{rects.map((rect, index) => <span className="cited-passage-highlight" key={index} style={rect} />)}</div>
    <aside className="cited-passage-notice" aria-label="Shared citation">
      <Quote size={16} aria-hidden="true" />
      <span role="status">{rects.length ? "Cited passage highlighted" : "This passage may have changed. The original quote is below."}</span>
      <button type="button" aria-label="Dismiss citation highlight" onClick={() => setCitation(null)}><X size={16} /></button>
      {!rects.length && <blockquote>{citation.quote}</blockquote>}
    </aside>
  </>;
}

function trackCitation(content: HTMLElement, root: HTMLElement, citation: PassageCitation, revision: string | undefined, setRects: (rects: Rect[]) => void) {
  let frame = 0;
  let active = true;
  let followLayout = true;
  const stopFollowing = () => { followLayout = false; };
  const measure = () => {
    const occurrence = resolveCitationOccurrence(passageText(content), citation, revision);
    const range = occurrence === null ? null : passageRange(content, citation.quote, occurrence);
    if (!range) { setRects([]); return; }
    const origin = root.getBoundingClientRect();
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    setRects(rects.map((rect) => ({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height })));
    if (followLayout && rects.length) window.scrollBy({ top: rects[0].top - Math.max(100, window.innerHeight * 0.3), behavior: "instant" });
  };
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  };
  const resize = new ResizeObserver(schedule);
  const mutations = new MutationObserver(schedule);
  resize.observe(root);
  mutations.observe(content, { subtree: true, childList: true, characterData: true });
  // Re-measure as fonts and media settle, but never pull a reader back after
  // they start interacting. Overlays keep tracking without altering article DOM.
  document.fonts.ready.then(() => { if (active) schedule(); });
  content.addEventListener("load", schedule, true);
  const inputs = ["wheel", "touchstart", "pointerdown", "keydown"];
  inputs.forEach((event) => window.addEventListener(event, stopFollowing, { passive: true }));
  schedule();
  return () => {
    active = false;
    cancelAnimationFrame(frame);
    resize.disconnect();
    mutations.disconnect();
    content.removeEventListener("load", schedule, true);
    inputs.forEach((event) => window.removeEventListener(event, stopFollowing));
  };
}
