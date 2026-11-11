import { useMemo, useState } from "react";
import { parseDesignConfig, serializeDesignConfig } from "../../shared/design-config";
import type { Theme } from "../../shared/types";

export function useDesignConfig(local: Theme, setLocal: (theme: Theme) => void) {
  const [mode, setMode] = useState<"templates" | "controls" | "json">("templates");
  const [draft, setDraft] = useState<string | null>(null);
  const serialized = serializeDesignConfig(local);
  const text = draft ?? serialized;
  const pending = text !== serialized;
  const parsed = useMemo(() => parseDesignConfig(text), [text]);
  const apply = () => {
    if (!parsed.theme) return;
    setLocal(parsed.theme);
    setDraft(null);
  };
  const edit = (value: string) => setDraft(value === serialized ? null : value);
  return { mode, setMode, text, edit, pending, error: parsed.error, apply, discard: () => setDraft(null) };
}
