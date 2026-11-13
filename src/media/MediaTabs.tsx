import { useTeamIdentity } from "../auth/TeamContext";
import { Cloud,SlidersHorizontal,Link,Images } from "lucide-react";
import type { MediaPickerController } from "./useMediaPicker";
type Props = { state: Pick<MediaPickerController, "tab" | "setTab" | "onInsert"> };
export default function MediaTabs({ state }: Props) {
  const { tab, setTab } = state;
  const { role } = useTeamIdentity();
  return (
    <div className="section-tabs" role="group" aria-label="Media source">
      {state.onInsert && <button
        className={tab === "link" ? "active" : ""} aria-pressed={tab === "link"}
        onClick={() => setTab("link")}
      >
        <Link size={15} />
        From a link
      </button>}
      <button className={tab === "uploads" ? "active" : ""} aria-pressed={tab === "uploads"} onClick={() => setTab("uploads")}>
        <Images size={15} /> Uploads
      </button>
      {role === "owner" && <><button
        className={tab === "library" ? "active" : ""} aria-pressed={tab === "library"}
        onClick={() => setTab("library")}
      >
        <Cloud size={15} />
        Cloudinary library
      </button>
      <button
        className={tab === "defaults" ? "active" : ""} aria-pressed={tab === "defaults"}
        onClick={() => setTab("defaults")}
      >
        <SlidersHorizontal size={15} />
        Defaults
      </button></>}
    </div>
  );
}
