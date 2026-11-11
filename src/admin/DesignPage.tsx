import { Designer } from "../BlogDesigner";
import type { AdminController } from "./useAdminController";
export default function DesignPage({
  state,
}: {
  state: Pick<
    AdminController,
    | "themeLoaded"
    | "theme"
    | "setTheme"
    | "notify"
    | "route"
    | "navigate"
    | "setDesignDirty"
  >;
}) {
  if (!state.themeLoaded)
    return <p className="page-content">Loading blog design…</p>;
  return (
    <Designer
      theme={state.theme}
      setTheme={state.setTheme}
      notify={state.notify}
      section={state.route.section || "homepage"}
      setSection={(section) => state.navigate({ view: "designer", section })}
      onDirtyChange={state.setDesignDirty}
    />
  );
}
