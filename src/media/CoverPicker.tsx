import { resolveAudio } from "../../shared/audio";
import CoverMedia from "../CoverMedia";
import AudioCoverPicker from "./AudioCoverPicker";
import { mediaPath } from "../base-path";
import { Check, Upload, X } from "lucide-react";
import { coverImageTypes } from "../../shared/cover";
import "../cover-picker.css";
import CoverSources from "./CoverSources";
import SharingImageLibrary from "./SharingImageLibrary";
import UploadedVideos from "./UploadedVideos";
import { resolveVideo, videoHelp } from "../../shared/video";

import { useCoverPicker, type CoverPickerController } from "./useCoverPicker";
export default function CoverPicker(
  props: Parameters<typeof useCoverPicker>[0],
) {
  const state = useCoverPicker(props);
  const { value, onChange, images, source, uploading, error, selected } = state;
  return (
    <section className="cover-picker" aria-label="Cover media">
      <h3>Cover media</h3>
      <p className="muted">
        Add an image, video, or audio player to introduce your article.
      </p>
      {selected && (
        <div className="cover-selected">
          <CoverMedia mode={state.mode} src={selected} alt="Selected cover" />
          <button
            type="button"
            className="button"
            disabled={uploading}
            onClick={() => onChange("")}
          >
            <X size={14} />
            Remove cover
          </button>
        </div>
      )}
      <CoverAudioDisplay state={state} />
      <CoverSources state={state} />
      {source === "audio" && <AudioCoverPicker value={value} onChange={onChange} />}
      {source === "video" && <CoverVideoPicker value={value} onChange={onChange} />}
      {source === "library" && (
        <SharingImageLibrary
          value={value}
          onChange={onChange}
          purpose="cover"
        />
      )}
      {source === "upload" && <CoverUpload state={state} />}
      {source === "content" && <ContentCoverChoices images={images} selected={selected} onChange={onChange} />}
      {source === "url" && (
        <label>
          Cover image URL
          <input
            type="url"
            placeholder="https://…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {selected && (
        <p className="muted" role="status">
          Cover selected. Save the post to apply it.
        </p>
      )}
    </section>
  );
}

function CoverUpload({
  state,
}: {
  state: Pick<
    CoverPickerController,
    "file" | "uploadCover" | "uploading" | "selected"
  >;
}) {
  const { file, uploadCover, uploading, selected } = state;
  return (
    <div className="cover-upload">
      <input
        ref={file}
        type="file"
        aria-label="Upload cover image"
        accept={coverImageTypes.join(",")}
        hidden
        disabled={uploading}
        onChange={uploadCover}
      />
      <button
        type="button"
        className="button"
        disabled={uploading}
        onClick={() => file.current?.click()}
      >
        <Upload size={15} />
        {uploading
          ? "Uploading…"
          : selected
            ? "Upload another image"
            : "Choose an image"}
      </button>
      <span className="muted">PNG, JPEG, WebP, or GIF · up to 10 MB</span>
    </div>
  );
}

function CoverAudioDisplay({ state }: { state: CoverPickerController }) {
 if (!resolveAudio(state.value) || !state.onModeChange) return null;
 return <label>Audio display<select value={state.mode} onChange={event => state.onModeChange?.(event.target.value as "player" | "preview")}><option value="player">Compact player</option><option value="preview">Artwork preview</option></select></label>;
}

function CoverVideoPicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  return <div className="cover-video-picker"><UploadedVideos onSelect={onChange} /><label>Video URL<input type="url" placeholder="https://…" value={value} onChange={event => onChange(event.target.value)} /></label>{value && !resolveVideo(value) && <p className="notice" role="alert">This is not a supported video link.</p>}<p className="muted">{videoHelp}</p></div>;
}

function ContentCoverChoices({ images, selected, onChange }: Pick<CoverPickerController, "images" | "selected" | "onChange">) {
  if (!images.length) return <p className="muted">No images in this post yet. Add an image or an image slide to your content, or upload a cover.</p>;
  return <div className="cover-candidates">{images.map((image, i) => <button type="button" key={image.url} aria-label={`Use ${image.alt || `image ${i + 1}`} as cover`} aria-pressed={selected === image.url} onClick={() => onChange(image.url)}><img src={mediaPath(image.url)} alt={image.alt || `Image ${i + 1}`} loading="lazy" /><span>{image.alt || `Image ${i + 1}`}</span>{selected === image.url && <Check size={18} aria-hidden="true" />}</button>)}</div>;
}
