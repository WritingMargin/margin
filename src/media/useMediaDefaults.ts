import { useEffect, useState } from "react";
import { initialMediaDefaults, type MediaDefaults } from "../../shared/media-defaults";
import { api } from "../api";

export function useMediaDefaults() {
  const [defaults, setDefaults] = useState(initialMediaDefaults);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<MediaDefaults>("/settings/media", { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setDefaults(value); setError(""); } })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const changed = () => setAttempt(value => value + 1);
    window.addEventListener("margin:media-defaults", changed);
    return () => window.removeEventListener("margin:media-defaults", changed);
  }, []);
  return { defaults, loading, error, retry: () => setAttempt(value => value + 1) };
}
