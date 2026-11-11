import { mediaPath } from "../base-path";
import { Image,Eye,Upload } from "lucide-react";
import Empty from "../components/Empty";
import type { MediaPickerController } from "./useMediaPicker";
type Props = {
  state: Pick<
    MediaPickerController,
    | "notify"
    | "upload"
    | "assets"
    | "uploading"
    | "setUploading"
    | "error"
    | "setError"
    | "file"
    | "refresh"
    | "insert"
  >;
};
export default function MediaLibrary({ state }: Props) {
  const { upload, assets, uploading, file, insert } = state;
  return (
    <>
      <div className="library-toolbar">
        <span className="muted">{assets.length} assets</span>
        <input
          ref={file}
          type="file"
          accept="image/*,video/*"
          hidden
          onChange={upload}
        />
        <button
          className="button"
          disabled={uploading}
          onClick={() => file.current?.click()}
        >
          <Upload size={14} />
          {uploading ? "Uploading…" : "Upload media"}
        </button>
      </div>
      <div className="asset-grid">
        {assets.map((a) => (
          <button
            key={a.public_id}
            aria-label={`Preview ${a.public_id}`}
            onClick={() =>
              insert(
                a.secure_url,
                a.resource_type === "video" ? "video" : "image",
              )
            }
          >
            {a.resource_type === "video" ? (
              <video src={mediaPath(a.secure_url)} />
            ) : (
              <img src={mediaPath(a.secure_url)} alt={a.public_id} />
            )}
            <span>
              {a.public_id.split("/").pop()}
              <Eye size={14} />
            </span>
          </button>
        ))}
      </div>
      {!assets.length && (
        <Empty
          icon={<Image />}
          title="Your visual library starts here."
          text="Upload an image or video to Cloudinary, then add it to any post."
        />
      )}
    </>
  );
}
