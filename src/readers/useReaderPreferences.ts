import { useEffect, useState } from "react";
import type { ReaderPreferences } from "../../shared/interactions";
import { api, json } from "../api";
export function useReaderPreferences() {
  const [saved, setSaved] = useState<ReaderPreferences | null>(null);
  const [value, setValue] = useState<ReaderPreferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<ReaderPreferences>("/settings/readers", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setValue(result);
          setSaved(result);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [attempt]);
  const dirty = JSON.stringify(saved) !== JSON.stringify(value);
  const update = (patch: Partial<ReaderPreferences>) => {
    setValue((current) => current && { ...current, ...patch });
    setMessage("");
  };
  async function save() {
    if (!value || busy) return null;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<ReaderPreferences>(
        "/settings/readers",
        json("PUT", value),
      );
      setSaved(result);
      setValue(result);
      setMessage("Reader settings saved.");
      return result;
    } catch (error) {
      setError((error as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return {
    value,
    dirty,
    busy,
    error,
    message,
    update,
    save,
    retry: () => setAttempt((value) => value + 1),
  };
}
