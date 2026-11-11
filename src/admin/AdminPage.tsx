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
