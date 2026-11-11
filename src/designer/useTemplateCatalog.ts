import { useEffect, useState } from "react";
import { bundledTemplateCatalog, parseTemplateCatalog, type TemplateCatalog } from "../../shared/template-catalog";
import { api } from "../api";

let catalog = bundledTemplateCatalog;
let pending: Promise<TemplateCatalog> | null = null;

function loadCatalog(): Promise<TemplateCatalog> {
  if (pending) return pending;
  pending = api<unknown>("/settings/templates", { signal: AbortSignal.timeout(7000) })
    .then(value => {
      const valid = parseTemplateCatalog(value);
      if (!valid) throw new Error("Unsupported template catalog");
      catalog = valid;
      return catalog;
    })
    .catch(() => catalog)
    .finally(() => { pending = null; });
  return pending;
}

export function useTemplateCatalog() {
  const [current, setCurrent] = useState(catalog);
  useEffect(() => {
    let active = true;
    void loadCatalog().then(value => { if (active) setCurrent(value); });
    return () => { active = false; };
  }, []);
  return current;
}
