import { useEffect, useRef, useState } from "react";

export type Confirmation = { title: string; description: string; confirmLabel?: string; cancelLabel?: string };

export function useConfirmation() {
  const [prompt, setPrompt] = useState<Confirmation | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  useEffect(() => () => pending.current?.(false), []);

  function ask(details: Confirmation): Promise<boolean> {
    if (pending.current) return Promise.resolve(false);
    setPrompt(details);
    return new Promise((resolve) => { pending.current = resolve; });
  }
  function answer(accepted: boolean) {
    pending.current?.(accepted);
    pending.current = null;
    setPrompt(null);
  }
  return { prompt, ask, answer };
}
