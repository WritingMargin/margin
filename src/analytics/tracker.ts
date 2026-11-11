import type { AnalyticsEvent } from "../../shared/analytics";
import { unmountPath } from "../base-path";
import {
  activeDelta,
  analyticsID,
  cleanClickURL,
  normalizedPassage,
  readingDepth,
  readingSession,
} from "./measurement";
import { articleSections, selectionSection, visibleSection } from "./sections";
import { analyticsTransport } from "./transport";
import { trackPageMedia } from "./media-tracker";

export function analyticsAllowed(): boolean {
  const privacy = navigator as Navigator & { globalPrivacyControl?: boolean };
  return (
    navigator.doNotTrack !== "1" &&
    !privacy.globalPrivacyControl &&
    !unmountPath(location.pathname).startsWith("/admin")
  );
}
const privateElements =
  "input,textarea,select,form,dialog,[contenteditable=true],.public-comments,.reader-notes,[data-media-id]";

export function trackPublicPage(postId = "", revision = "") {
  if (!analyticsAllowed()) return () => {};
  const content = document.querySelector<HTMLElement>(
    ".public-article .markdown-body",
  );
  const sections = articleSections(content);
  const viewId = analyticsID(),
    sessionId = readingSession();
  let activeMs = 0,
    scrollDepth = 0,
    previous = performance.now(),
    lastActivity = previous;
  let lastHighlight = "",
    selectionTimer = 0;
  const transport = analyticsTransport(() => ({
    viewId,
    sessionId,
    postId,
    revision,
    activeMs,
    scrollDepth,
    sections: sections.map(({ id, label, activeMs }) => ({
      id,
      label,
      activeMs,
    })),
    events: [],
    media: media.snapshot(),
  }));
  const media = trackPageMedia(document, event => transport.addMedia(event));
  const listeners = new AbortController();
  const options = { signal: listeners.signal, passive: true };
  function sample() {
    const now = performance.now();
    const delta = activeDelta(
      now,
      previous,
      lastActivity,
      document.visibilityState === "visible" && document.hasFocus(),
    );
    previous = now;
    if (!delta) return;
    activeMs = Math.min(86_400_000, activeMs + delta);
    const section = visibleSection(sections, content);
    if (section && activeMs < 86_400_000) section.activeMs += delta;
    const rect = (content || document.documentElement).getBoundingClientRect();
    scrollDepth = Math.max(
      scrollDepth,
      readingDepth(rect.top, rect.height, innerHeight),
    );
  }
  function activity() {
    lastActivity = performance.now();
  }
  function selected() {
    const selection = window.getSelection();
    if (!content || !selection?.rangeCount || selection.isCollapsed)
      return null;
    const range = selection.getRangeAt(0);
    if (
      !content.contains(range.startContainer) ||
      !content.contains(range.endContainer)
    )
      return null;
    const element = range.commonAncestorContainer.parentElement;
    if (element?.closest(privateElements)) return null;
    const target = normalizedPassage(selection.toString());
    return target
      ? { target, sectionId: selectionSection(sections, range) }
      : null;
  }
  function record(
    kind: AnalyticsEvent["kind"],
    value: { target: string; sectionId: string },
  ) {
    transport.add({ id: analyticsID(), kind, ...value });
  }
  function highlight() {
    const value = selected();
    if (!value) {
      lastHighlight = "";
      return;
    }
    const key = `${value.sectionId}:${value.target}`;
    if (key !== lastHighlight) {
      record("highlight", value);
      lastHighlight = key;
    }
  }
  function selectionChanged() {
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(highlight, 500);
  }
  function copy() {
    const value = selected();
    if (value) {
      highlight();
      record("copy", value);
    }
  }
  function click(event: MouseEvent) {
    const node =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("a,button,summary")
        : null;
    if (!node || node.closest(privateElements)) return;
    const target = clickTarget(node);
    if (target)
      record("click", {
        target,
        sectionId: visibleSection(sections, content)?.id || "",
      });
  }
  function visibility() {
    sample();
    if (document.visibilityState === "hidden") transport.flush();
    else resume();
  }
  function resume() {
    previous = performance.now();
    activity();
  }
  function leave() {
    sample();
    highlight();
    media.exit();
    transport.flush();
  }
  function pageShown() {
    media.restore();
    resume();
  }
  for (const event of [
    "pointerdown",
    "pointermove",
    "keydown",
    "scroll",
    "touchstart",
  ])
    window.addEventListener(event, activity, options);
  document.addEventListener("click", click, { signal: listeners.signal });
  document.addEventListener("selectionchange", selectionChanged, options);
  document.addEventListener("copy", copy, options);
  document.addEventListener("visibilitychange", visibility, options);
  window.addEventListener("pagehide", leave, options);
  window.addEventListener("pageshow", pageShown, options);
  window.addEventListener("focus", resume, options);
  const clock = window.setInterval(sample, 1000);
  const heartbeat = window.setInterval(() => {
    sample();
    void transport.send();
  }, 15_000);
  void transport.send();
  return () => {
    leave();
    media.stop();
    listeners.abort();
    window.clearInterval(clock);
    window.clearInterval(heartbeat);
    window.clearTimeout(selectionTimer);
  };
}
function clickTarget(node: HTMLElement): string | null {
  if (node instanceof HTMLAnchorElement)
    return cleanClickURL(node.href, location.href);
  const label = (node.getAttribute("aria-label") || node.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return label ? `button:${label}` : null;
}
