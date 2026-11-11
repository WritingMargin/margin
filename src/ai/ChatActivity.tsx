import { Loader2 } from "lucide-react";
import type { WritingActivity } from "../../shared/writing";

export default function ChatActivity({
  activity,
  pending = false,
}: {
  activity?: WritingActivity;
  pending?: boolean;
}) {
  if (pending) return <PendingActivity activity={activity} />;
  return <CompletedActivity activity={activity} />;
}

function PendingActivity({ activity }: { activity?: WritingActivity }) {
  const latest = activity?.progress.at(-1) || "Thinking…";
  return (
    <div
      className="chat-activity chat-activity-pending"
      role="status"
      aria-live="polite"
    >
      <div className="chat-activity-label">
        <Loader2 size={14} className="spin" aria-hidden="true" />
        <span>{latest}</span>
      </div>
      {activity?.summary && (
        <p className="chat-activity-summary">{activity.summary}</p>
      )}
    </div>
  );
}

function CompletedActivity({ activity }: { activity?: WritingActivity }) {
  if (!activity?.summary && !activity?.progress.length) return null;
  return (
    <details className="chat-activity chat-activity-complete">
      <summary>{activity.summary ? "Thinking summary" : "Activity"}</summary>
      {activity.progress.length > 0 && (
        <ol>
          {activity.progress.map((message, index) => (
            <li key={`${index}:${message}`}>{message}</li>
          ))}
        </ol>
      )}
      {activity.summary && (
        <p className="chat-activity-summary">{activity.summary}</p>
      )}
    </details>
  );
}
