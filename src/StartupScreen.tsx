import { useState } from "react";
import "./startup-screen.css";

// The Go server replaces this marker with escaped, themed HTML before sending
// the workspace document. Keep that exact markup during hydration so branding
// is visible before JavaScript loads, without another settings request.
const placeholder = '<span class="startup-placeholder" data-margin-startup="">Opening…</span>';

export default function StartupScreen() {
  const [markup] = useState(() =>
    typeof document === "undefined"
      ? placeholder
      : document.getElementById("margin-startup")?.innerHTML || placeholder,
  );
  return (
    <main
      id="margin-startup"
      className="startup-screen"
      role="status"
      aria-live="polite"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
