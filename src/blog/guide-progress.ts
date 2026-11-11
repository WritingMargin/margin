import { api, json } from "../api";
import { activeContentsSection } from "../markdown/ContentsLayout";

export function guideHeadings(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]'))
    .filter(el => el.querySelector(':scope > .section-permalink') && el.getClientRects().length > 0);
}

export function currentGuideSection(root: HTMLElement) {
  const headings = guideHeadings(root);
  const last = headings.at(-1);
  const atEnd = window.scrollY > 0 && window.scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
  return activeContentsSection(headings.map(el => ({ id: el.id, top: el.getBoundingClientRect().top })), Math.min(160, innerHeight * .25), Boolean(last && atEnd));
}

export function guideReturnPath(root: HTMLElement) {
  const url = new URL(location.href);
  const section = currentGuideSection(root);
  if (section) url.searchParams.set("resumeGuide", section);
  return url.pathname + url.search;
}

/** Load before writing so the initial viewport cannot overwrite a saved section. */
export function trackGuideProgress(root: HTMLElement, id: string, revision: string, report: (message: string) => void, loaded: (completed: string[]) => void = () => {}) {
  const path = `/public/posts/${encodeURIComponent(id)}/guide-progress`;
  let stopped = false, ready = false, moved = false, saving = false;
  let pending = "", saved = "", timer = 0;
  async function flush() {
    clearTimeout(timer);
    if (saving || !pending || stopped) return;
    const section = pending;
    pending = "";
    if (section === saved) return;
    saving = true;
    try {
      await api(path, { ...json("PUT", { section, revision }), keepalive: true });
      saved = section;
      if (!stopped) report("Your place is saved.");
    } catch {
      if (!stopped) report("Couldn’t save your place. Keep reading and we’ll retry.");
    } finally {
      saving = false;
      if (pending && !stopped) void flush();
    }
  }
  function scroll() {
    moved = true;
    if (!ready) return;
    pending = currentGuideSection(root);
    clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), 600);
  }
  function leave() { if (ready) { pending = currentGuideSection(root); void flush(); } }
  function visibility() { if (document.visibilityState === "hidden") leave(); }
  function resume(section: string) {
    if (location.hash || moved) return;
    const heading = guideHeadings(root).find(el => el.id === section);
    heading?.scrollIntoView({ behavior: "instant", block: "start" });
  }
  async function restore() {
    try {
      const result = await api<{ section: string; completed?: string[] }>(path);
      await document.fonts.ready;
      if (stopped) return;
      loaded(completionValues(result.completed));
      saved = result.section;
      const url = new URL(location.href);
      const requested = url.searchParams.get("resumeGuide");
      const section = requested || saved;
      resume(section);
      if (requested) {
        url.searchParams.delete("resumeGuide");
        history.replaceState(history.state, "", url);
      }
      ready = true;
      report(saved ? "Your place is saved." : "Your place will be saved as you read.");
      if (requested || location.hash || moved) scroll();
    } catch {
      if (!stopped) report("Couldn’t load your saved place. Refresh to try again.");
    }
  }
  window.addEventListener("scroll", scroll, { passive: true });
  window.addEventListener("pagehide", leave);
  document.addEventListener("visibilitychange", visibility);
  void restore();
  return () => {
    leave();
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener("scroll", scroll);
    window.removeEventListener("pagehide", leave);
    document.removeEventListener("visibilitychange", visibility);
  };
}

export type GuideStep = { id: string; title: string; element: HTMLElement };

/** Main headings are steps; subheadings belong to their enclosing step. */
export function guideSteps(root: HTMLElement): GuideStep[] {
  const headings = guideHeadings(root);
  const level = guideStepLevel(headings.map(el => Number(el.tagName.slice(1))));
  return headings.filter(el => Number(el.tagName.slice(1)) === level).map(element => {
    const copy = element.cloneNode(true) as HTMLElement;
    copy.querySelectorAll(".section-permalink").forEach(link => link.remove());
    return { id: element.id, title: (copy.textContent || "").replace(/\s+/g, " ").trim(), element };
  });
}

export function currentGuideStep(steps: GuideStep[]) {
  return activeContentsSection(steps.map(step => ({id:step.id, top:step.element.getBoundingClientRect().top})), Math.min(160, innerHeight * .25));
}

function completionValues(value: unknown): string[] { return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []; }

export function guideStepLevel(levels: number[]) {
  const top = Math.min(...levels);
  // A single document title is introductory, rather than a one-step guide.
  if (top === 1 && levels.filter(level => level === 1).length === 1 && levels.includes(2)) return 2;
  return top;
}
