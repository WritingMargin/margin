import type { ComponentPropsWithRef } from "react";
import "../selects.css";

/** Shared native select: preserves form semantics, refs, and mobile menus. */
export default function Select({
  className = "",
  ...props
}: ComponentPropsWithRef<"select">) {
  return <select {...props} className={`margin-select ${className}`.trim()} />;
}
