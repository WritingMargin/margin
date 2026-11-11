import PageHeading from "../components/PageHeading";
import MediaPicker from "../media/MediaPicker";
import type { AdminController } from "./useAdminController";
export default function MediaPage({
  state,
}: {
  state: Pick<
    AdminController,
    "route" | "navigate" | "notify"
  >;
}) {
  return (
    <section className="page-content">
      <PageHeading
        label="YOUR CREATIVE TOOLKIT"
        title="Media library"
        description="Browse your uploads and configure the defaults for new media."
      />
      <MediaPicker
        activeTab={state.route.mediaTab || "uploads"}
        onTabChange={(mediaTab) => state.navigate({ view: "media", mediaTab })}
        notify={state.notify}
      />
    </section>
  );
}
