import { Cloud,SlidersHorizontal,Link,Images } from "lucide-react";
import type { MediaPickerController } from "./useMediaPicker";
type Props = { state: Pick<MediaPickerController, "tab" | "setTab" | "onInsert"> };
export default function MediaTabs({ state }: Props) {
  const { tab, setTab } = state;
  return (
    <div className="section-tabs">
      {state.onInsert && <button
        className={tab === "link" ? "active" : ""}
        onClick={() => setTab("link")}
      >
        <Link size={15} />
        From a link
      </button>}
      <button className={tab === "uploads" ? "active" : ""} onClick={() => setTab("uploads")}>
        <Images size={15} /> Uploads
      </button>
      <button
        className={tab === "library" ? "active" : ""}
        onClick={() => setTab("library")}
      >
        <Cloud size={15} />
        Cloudinary library
      </button>
      <button
        className={tab === "defaults" ? "active" : ""}
        onClick={() => setTab("defaults")}
      >
        <SlidersHorizontal size={15} />
        Defaults
      </button>
    </div>
  );
}
