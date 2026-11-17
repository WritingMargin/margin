import BillingLink from "../auth/BillingLink";
import type { AIConfig } from "../../shared/ai";
import "../ai.css";
export default function AICredits({
  config,
  onRefresh,
}: {
  config: AIConfig;
  onRefresh: () => void;
}) {
  return (
    <div className="ai-credit-card">
      <div className="ai-credit-heading">
        <strong>
          {config.credits ?? 0} <span>credits available</span>
        </strong>
        <button className="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <p>Manage your plan, explore what’s included, or add more AI credits.</p>
      <BillingLink />
    </div>
  );
}
