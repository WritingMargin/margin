import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export default function Accordion({ title, children }: { title: string; children: ReactNode }) {
  return <details className="margin-accordion">
    <summary>
      <span>{title}</span>
      <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
    </summary>
    <div className="margin-accordion-content">{children}</div>
  </details>;
}
