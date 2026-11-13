import ConnectedApps from "./ConnectedApps";
import PageHeading from "../components/PageHeading";
import ReviewerWorkspace from "../team/ReviewerWorkspace";
import { canOpenWorkspaceView } from "../../shared/team";
import ProfilePage from "../profile/ProfilePage";
import PricingPage from "../Pricing";
import ReadersPage from "../readers/ReadersPage";
import AnalyticsPage from "../analytics/AnalyticsPage";
import DesignPage from "./DesignPage";
import EditorPage from "./EditorPage";
import MediaPage from "./MediaPage";
import PostsPage from "./PostsPage";
import SettingsPanel from "./SettingsPanel";
import type { AdminController } from "./useAdminController";
const pages: Partial<Record<AdminController["view"], import("react").ComponentType<{ state: AdminController }>>> = {
  analytics: AnalyticsPage,
  editor: EditorPage,
  posts: PostsPage,
  designer: DesignPage,
  media: MediaPage,
  comments: ReadersPage,
  readers: ReadersPage,
  profile: WorkspaceSettings,
  settings: WorkspaceSettings,
  pricing: PricingPage,
};

export default function AdminPage({ state }: { state: AdminController }) {
  if (!canOpenWorkspaceView(state.role, state.view) || (state.view === "pricing" && !state.primaryOwner)) return <section className="page-content"><h1>Access restricted</h1><p>Your role does not have access to this page.</p><button className="button" onClick={() => state.setView("posts")}>All content</button></section>;
  if (state.view === "connections") return <section className="page-content"><PageHeading label="YOUR WORKSPACE" title="Connected apps" description="Manage apps connected to your account in this publication." /><ConnectedApps primaryOwner={state.primaryOwner} /></section>;
  if (state.view === "reviews") return <ReviewerWorkspace user={state.user} logout={state.logout} />;
  const Page = pages[state.view];
  if (Page) return <Page state={state} />;
  return <section className="page-content">
    <h1>Page not found</h1>
    <p>This workspace link doesn’t exist.</p>
    <button className="button" onClick={() => state.setView("posts")}>All posts</button>
  </section>;
}

function WorkspaceSettings({ state }: { state: AdminController }) {
  if (state.view === "profile") return <ProfilePage notify={state.notify} onDirtyChange={state.setSettingsDirty} />;
  return (
    <SettingsPanel
      cloudManaged={Boolean(state.cloudManaged)}
      notify={state.notify}
      theme={state.theme}
      tab={state.route.settingsTab ?? "general"}
      setTab={(settingsTab) =>
        state.navigate({ view: "settings", settingsTab })
      }
      onDirtyChange={state.setSettingsDirty}
      onPublicationChange={(publicationType) =>
        state.setTheme((current) => ({ ...current, publicationType }))
      }
    />
  );
}
