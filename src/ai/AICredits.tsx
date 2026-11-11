import { sitePath } from "../base-path";
import { ArrowUpRight } from "lucide-react";
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
      <a className="button" href={sitePath("/admin/pricing")}>
        Plans & credits <ArrowUpRight size={14} />
      </a>
    </div>
  );
}
