import "./media-picker.css";
import AccountGate from "../auth/AccountGate";
import { Cloud } from "lucide-react";
import Empty from "../components/Empty";
import MediaLibrary from "./MediaLibrary";
import MediaLink from "./MediaLink";
import MediaTabs from "./MediaTabs";
import MediaSelection from "./MediaSelection";
import MediaDefaultsSettings from "./MediaDefaultsSettings";
import UploadedMedia from "./UploadedMedia";
import { useMediaPicker, type MediaPickerController } from "./useMediaPicker";

export default function MediaPicker(props: Parameters<typeof useMediaPicker>[0]) {
  const state = useMediaPicker(props);
  return <div className="media-picker">
    <MediaTabs state={state} />
    <div className="media-picker-content" role="region" aria-label="Media options" tabIndex={0}>
      <MediaSource state={state} />
      {state.tag && state.tab !== "defaults" && <MediaSelection state={state} />}
    </div>
  </div>;
}
function MediaSource({ state }: { state: MediaPickerController }) {
  if (state.tab === "uploads") return <UploadedMedia onSelect={(url, kind) => state.insert(url, kind)} />;
  if (state.tab === "defaults") return <MediaDefaultsSettings notify={state.notify} />;
  if (state.tab === "link" && state.onInsert) return <MediaLink state={state} />;
  return <div className="media-picker-body">
    <AccountGate feature="Cloudinary integration" onConnected={() => void state.refresh()}>
      <CloudinaryLibrary state={state} />
    </AccountGate>
  </div>;
}
function CloudinaryLibrary({ state }: { state: MediaPickerController }) {
  if (state.loading) return <p role="status">Opening your library…</p>;
  if (state.error) return <div className="error-box" role="alert">{state.error}<button className="button" onClick={() => void state.refresh()}>Retry</button></div>;
  if (state.configured) return <MediaLibrary state={state} />;
  return <Empty icon={<Cloud />} title="Connect your creative library." text="Configure Cloudinary on your server to browse and upload there. Uploaded images, videos and media links work without this connection." />;
}
