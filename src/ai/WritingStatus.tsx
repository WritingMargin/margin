import type { AIConfig } from "../../shared/ai";
import BillingLink from "../auth/BillingLink";

export function WritingAvailability({
  config,
  error,
  refresh,
}: {
  config: AIConfig | null;
  error: string;
  refresh: () => void;
}) {
  if (error)
    return (
      <div className="error-box" role="alert">
        {error}
        <button className="button" onClick={refresh}>
          Retry connection
        </button>
      </div>
    );
  if (!config)
    return (
      <p role="status" className="small-text">
        Checking the assistant connection…
      </p>
    );
  if (!config.features.writing)
    return (
      <p className="notice">
        The writing assistant needs a configured text provider and an active AI
        plan. <BillingLink />
      </p>
    );
  return (
    <p className="writing-cost">
      {config.costs?.writing}{" "}
      {config.costs?.writing === 1 ? "credit" : "credits"} per request ·{" "}
      {config.credits} available
    </p>
  );
}
