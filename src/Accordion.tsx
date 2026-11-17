import { ChevronDown } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Props = Omit<ComponentPropsWithoutRef<"details">, "title" | "children"> & { title: string; children: ReactNode };
export default function Accordion({ title, children, className = "", ...props }: Props) {
  return <details {...props} className={`margin-accordion ${className}`.trim()}>
    <summary>
      <span>{title}</span>
      <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
    </summary>
    <div className="margin-accordion-content">{children}</div>
  </details>;
}
