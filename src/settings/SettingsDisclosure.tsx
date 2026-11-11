import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import "./SettingsDisclosure.css";

export default function SettingsDisclosure({
  title,
  description,
  icon,
  status,
  className = "",
  children,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  status?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      className={`settings-card margin-accordion settings-disclosure ${className}`}
    >
      <summary>
        {icon && (
          <span className="settings-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="settings-disclosure-copy">
          <span className="settings-disclosure-title">{title}</span>
          <span className="settings-disclosure-description">{description}</span>
          {status && (
            <span className="settings-disclosure-status" role="status">
              {status}
            </span>
          )}
        </span>
        <ChevronDown
          className="settings-disclosure-caret"
          size={16}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </summary>
      <div className="settings-disclosure-body">{children}</div>
    </details>
  );
}
