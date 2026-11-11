import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { api, json } from "../api";
import { currentGuideStep, guideSteps, trackGuideProgress, type GuideStep } from "./guide-progress";
import type { CommentAuth } from "./useCommentAuth";

export function useGuideCompanion(root: RefObject<HTMLDivElement | null>, id: string, revision: string, auth: CommentAuth) {
  const [steps, setSteps] = useState<GuideStep[]>([]);
  const [active, setActive] = useState("");
  const [completed, setCompleted] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [completionError, setCompletionError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const completedRef = useRef(completed);
  completedRef.current = completed;
  const signedIn = useRef(false);
  const pendingKey = `margin-guide-sign-in:${id}`;
  const saveStep = useCallback((section: string, done: boolean) => api(`/public/posts/${encodeURIComponent(id)}/guide-steps`, json("PUT", {section, completed:done, revision})), [id, revision]);

  useEffect(() => {
    const article = root.current?.parentElement;
    if (!article) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = guideSteps(article);
      setSteps(previous => previous.map(step => step.id).join() === next.map(step => step.id).join() ? previous : next);
      setActive(currentGuideStep(next));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(article);
    window.addEventListener("scroll", schedule, {passive:true});
    window.addEventListener("resize", schedule);
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [root, id]);

  useEffect(() => {
    const article = root.current?.parentElement;
    if (!article || auth.loading) return;
    if (!auth.reader) {
      if (signedIn.current) setCompleted([]);
      signedIn.current = false;
      setReady(true);
      setStatus("");
      setCompletionError("");
      return;
    }
    signedIn.current = true;
    setReady(false);
    let mounted = true;
    async function hydrate(saved: string[]) {
      const pending = pendingCompletions(pendingKey, guideSteps(article!));
      const merged = [...new Set([...saved, ...pending])];
      if (!mounted) return;
      setCompleted(merged);
      try {
        for (const step of pending) await saveStep(step, true);
        sessionStorage.removeItem(pendingKey);
      } catch {
        if (mounted) setCompletionError("Some completed steps couldn’t be saved. Try marking them again.");
      } finally { if (mounted) setReady(true); }
    }
    const stop = trackGuideProgress(article, id, revision, setStatus, saved => { void hydrate(saved); });
    return () => { mounted = false; stop(); };
  }, [root, id, revision, auth.reader, auth.loading, pendingKey, saveStep]);

  async function toggle(section: string) {
    if (!ready || busy) return;
    const done = !completedRef.current.includes(section);
    const next = done ? [...completedRef.current, section] : completedRef.current.filter(item => item !== section);
    if (!auth.reader) { setCompleted(next); return; }
    setBusy(true);
    try { await saveStep(section, done); setCompleted(next); setCompletionError(""); setStatus("Your progress is saved."); }
    catch (error) { setCompletionError((error as Error).message); }
    finally { setBusy(false); }
  }
  function beforeSignIn() {
    try { sessionStorage.setItem(pendingKey, JSON.stringify(completedRef.current)); } catch { /* Reader can still sign in when browser storage is unavailable. */ }
  }
  function jump(step: GuideStep) {
    step.element.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block:"start"});
  }
  return {steps, active, completed, status: completionError || status, ready, busy, toggle, beforeSignIn, jump};
}

function pendingCompletions(key: string, steps: GuideStep[]): string[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) || "[]");
    if (!Array.isArray(value)) return [];
    const valid = new Set(steps.map(step => step.id));
    return value.filter((id): id is string => typeof id === "string" && valid.has(id));
  } catch { return []; }
}
