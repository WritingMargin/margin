import { sitePath } from "../base-path";
import {
  ArrowUpRight,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { AdminController } from "./useAdminController";
type Props = {
  state: Pick<
    AdminController,
    "view" | "posts" | "post" | "navigationSidebar" | "editor" | "nav"
  >;
};
export default function AdminTopbar({ state }: Props) {
  const { view, post, navigationSidebar, nav } = state;
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <button
          className="navigation-toggle"
          ref={navigationSidebar.toggleRef}
          onClick={() => navigationSidebar.setOpen(!navigationSidebar.open)}
          aria-label={
            navigationSidebar.open ? "Hide navigation" : "Open navigation"
          }
          title={navigationSidebar.open ? "Hide navigation" : "Open navigation"}
          aria-controls="workspace-navigation"
          aria-expanded={navigationSidebar.open}
        >
          <NavigationIcon open={navigationSidebar.open} />
        </button>
        <span>Workspace</span>
        <ChevronRight size={13} />
        <strong>
          {view === "editor"
            ? "All content"
            : view === "not-found"
              ? "Page not found"
              : view === "pricing"
                ? "Plans & credits"
                : nav.find((n) => n.id === (view === "comments" ? "readers" : view))
                    ?.label || (view === "profile" ? "Profile" : "Settings")}
        </strong>
        {view === "editor" && (
          <>
            <ChevronRight size={13} />
            <span className="current-crumb">{post.title}</span>
          </>
        )}
      </div>
      <a href={sitePath("/")} target="_blank" className="visit-blog">
        View blog <ArrowUpRight size={15} />
      </a>
    </header>
  );
}

function NavigationIcon({ open }: { open: boolean }) {
  return open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />;
}
