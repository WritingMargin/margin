import { useEffect, useRef, useState } from "react";
import { api, json } from "../api";
import SettingsDisclosure from "../settings/SettingsDisclosure";
import type { AnalyticsReport } from "../../shared/analytics";
import { number } from "./AnalyticsDetails";

export type ClassificationConfig = {
  available: boolean;
  connected: boolean;
  cost?: number;
  pending: number;
  published?: number;
  queue: { id: string; title: string; revision: string }[];
};
function useClassification(
  page: string,
  onClassified: () => void,
  refreshVersion: number,
  contentType: string,
) {
  const [config, setConfig] = useState<ClassificationConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [running, setRunning] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    setConfig(null);
    setError("");
    setProgress("");
    setRunning(false);
    api<ClassificationConfig>(
      `/analytics/classification?page=${encodeURIComponent(page)}&contentType=${encodeURIComponent(contentType)}`,
      {
        signal: controller.signal,
      },
    )
      .then((value) => {
        if (!controller.signal.aborted) setConfig(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [page, contentType, version, refreshVersion]);
  function recordCompleted(controller: AbortController, id: string) {
    if (controller.signal.aborted) return;
    setConfig(
      (current) =>
        current && {
          ...current,
          pending: Math.max(0, current.pending - 1),
          queue: current.queue.filter((queued) => queued.id !== id),
        },
    );
  }
  async function classify() {
    const controller = active.current;
    if (!controller || running || !canClassify(config)) return;
    setRunning(true);
    setError("");
    let completed = 0;
    try {
      for (const item of config.queue) {
        if (controller.signal.aborted) break;
        setProgress(
          `Classifying ${completed + 1} of ${config.queue.length}: ${item.title}`,
        );
        await api("/analytics/classification", {
          ...json("POST", { postId: item.id, revision: item.revision }),
          signal: controller.signal,
        });
        completed++;
        recordCompleted(controller, item.id);
      }
      if (!controller.signal.aborted) setVersion((value) => value + 1);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (!controller.signal.aborted) {
        setRunning(false);
        setProgress(`${completed} articles classified.`);
        onClassified();
      }
    }
  }
  return {
    config,
    error,
    progress,
    running,
    classify,
    reload: () => setVersion((value) => value + 1),
  };
}
export default function ClassificationControls({
  page,
  coverage,
  onClassified,
  refreshVersion,
  contentType,
}: {
  page: string;
  coverage: AnalyticsReport["classificationCoverage"];
  onClassified: () => void;
  refreshVersion: number;
  contentType: string;
}) {
  const state = useClassification(page, onClassified, refreshVersion, contentType);
  if (
    state.config &&
    !state.running &&
    !hasPendingClassification(state.config)
  ) {
    return (
      <section
        className="analytics-classifier-empty"
        aria-label="Margin’s Classifier"
      >
        <h2>Margin’s Classifier</h2>
        <p role="status">{classificationEmptyMessage(state.config)}</p>
      </section>
    );
  }
  return (
    <div className="analytics-disclosure analytics-classification">
      <SettingsDisclosure
        title="Margin’s Classifier"
        description="Identify content type and writing style for your published articles."
        status={`${number(coverage.classified_views)} of ${number(coverage.views)} article views classified in this period`}
      >
        <p className="analytics-inline-note">
          Classifications are saved per article revision. Unclassified views
          remain visible in the tables below. This action classifies current
          published articles in your page filter, across all dates; older
          unclassified revisions stay unclassified.
        </p>
        {!state.config && !state.error && (
          <p role="status">Checking classification availability…</p>
        )}
        {state.config && (
          <ClassificationAction
            config={state.config}
            running={state.running}
            classify={state.classify}
          />
        )}
        {state.progress && <p role="status">{state.progress}</p>}
        {state.error && (
          <div role="alert">
            <p>{state.error}</p>
            <button
              className="button"
              disabled={state.running}
              onClick={state.reload}
            >
              Reload availability
            </button>
          </div>
        )}
      </SettingsDisclosure>
    </div>
  );
}
export function ClassificationAction({
  config,
  running,
  classify,
}: {
  config: ClassificationConfig;
  running: boolean;
  classify: () => void;
}) {
  if (!hasPendingClassification(config))
    return (
      <p className="analytics-inline-note" role="status">
        {classificationEmptyMessage(config)}
      </p>
    );
  if (!config.available || !Number.isFinite(config.cost))
    return (
      <p className="analytics-inline-note">
        {config.connected
          ? "Margin’s Classifier is unavailable on your account. Check your AI credits and account connection in Settings."
          : "Connect your Margin account in Settings to use Margin’s Classifier."}
      </p>
    );
  return (
    <div className="analytics-classify-action">
      <p>
        {number(config.pending)} articles awaiting classification ·{" "}
        {config.cost} credits per article. Saved revisions are reused without
        another charge.
      </p>
      <button className="button" disabled={running} onClick={classify}>
        {running
          ? "Classifying…"
          : `Classify ${config.queue.length === 1 ? "article" : `next ${config.queue.length} articles`} · up to ${config.queue.length * config.cost!} credits`}
      </button>
    </div>
  );
}

function classificationEmptyMessage(config: ClassificationConfig) {
  if (config.published === 0)
    return "No published articles in this page filter.";
  if (config.published && config.pending === 0)
    return "All published articles in this page filter are already classified.";
  return "No articles are awaiting classification in this page filter.";
}

function hasPendingClassification(config: ClassificationConfig) {
  return (
    config.published !== 0 && config.pending > 0 && config.queue.length > 0
  );
}
function canClassify(
  config: ClassificationConfig | null,
): config is ClassificationConfig {
  return Boolean(
    config &&
    config.available &&
    Number.isFinite(config.cost) &&
    hasPendingClassification(config),
  );
}
