import { AuthorProfileProvider } from "../profile/AuthorProfileContext";
import ConfirmDialog from "./ConfirmDialog";
import AdminDialog from "./AdminDialog";
import AdminNotice from "./AdminNotice";
import AdminPage from "./AdminPage";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import { themeStyle } from "./post-utils";
import { useAdminController } from "./useAdminController";

export default function Admin(props: Parameters<typeof useAdminController>[0]) {
  const state = useAdminController(props);
  return (
    <AuthorProfileProvider><div
      className={`app-shell ${state.mobile ? "sidebar-open" : ""}`}
      style={themeStyle(state.theme)}
    >
      {state.navigationSidebar.narrow && state.navigationSidebar.open && (
        <button
          className="navigation-backdrop"
          aria-label="Dismiss navigation"
          onClick={state.navigationSidebar.close}
        />
      )}
      <AdminSidebar state={state} />
      <main className="main-workspace">
        <AdminTopbar state={state} />
        <AdminNotice state={state} />
        <AdminPage state={state} />
      </main>
      <AdminDialog state={state} />
      <ConfirmDialog confirmation={state.confirmation} />
    </div></AuthorProfileProvider>
  );
}
