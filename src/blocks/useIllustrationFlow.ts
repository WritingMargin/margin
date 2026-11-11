import { useEffect, useState, type RefObject } from "react";
import type { IllustrationFlowSpec } from "./illustration-flow-schema";
import { advanceFlow, initialFlow } from "./illustration-flow";

export function useIllustrationFlow(
  spec: IllustrationFlowSpec | undefined,
  host: RefObject<HTMLElement | null>,
  expanded: boolean,
) {
  const [active, setActive] = useState(!!spec);
  const [position, setPosition] = useState(initialFlow);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(false);
  const stepCount = spec?.steps.length ?? 0;
  const complete = position.step === stepCount - 1 && position.progress === 1;

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(query.matches);
      setPlaying(false);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) setPlaying(false);
    });
    if (host.current) observer.observe(host.current);
    document.addEventListener("visibilitychange", pause);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", pause);
    };
  }, [host, expanded]);
  useEffect(() => {
    if (!playing || !active || reducedMotion || !spec || complete) return;
    let frame = 0;
    let last: number | undefined;
    const tick = (now: number) => {
      const elapsed = last === undefined ? 0 : Math.min(100, now - last);
      last = now;
      setPosition((previous) =>
        advanceFlow(
          previous,
          (elapsed * speed) / (spec.secondsPerStep * 1000),
          stepCount,
        ),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, active, reducedMotion, spec, speed, stepCount, complete]);

  function seek(step: number) {
    setPlaying(false);
    setActive(true);
    setPosition({
      step: Math.max(0, Math.min(stepCount - 1, step)),
      progress: 0,
    });
  }
  function toggle() {
    if (reducedMotion) return;
    if (complete) {
      setPosition(initialFlow);
      setPlaying(true);
    } else setPlaying((value) => !value);
  }
  function explore() {
    setPlaying(false);
    setActive(false);
  }
  return {
    active,
    position,
    playing: playing && !complete,
    complete,
    speed,
    setSpeed,
    reducedMotion,
    seek,
    toggle,
    explore,
    follow: () => setActive(true),
  };
}
export type FlowController = ReturnType<typeof useIllustrationFlow>;
