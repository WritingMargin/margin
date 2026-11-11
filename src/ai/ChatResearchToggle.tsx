import { Search } from "lucide-react";

export default function ChatResearchToggle({
  checked,
  disabled,
  describedBy,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  describedBy?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="chat-research-toggle">
      <input
        className="sr-only"
        type="checkbox"
        aria-label="Research mode"
        aria-describedby={describedBy}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Search size={14} strokeWidth={1.7} aria-hidden="true" />
      <span>Research</span>
      <span className="chat-research-switch" aria-hidden="true" />
    </label>
  );
}
