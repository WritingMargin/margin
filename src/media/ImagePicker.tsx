import { mediaPath } from "../base-path";
import CoverSources from "./CoverSources";
import { Upload, X } from "lucide-react";
import { coverImageTypes } from "../../shared/cover";
import { useCoverPicker } from "./useCoverPicker";
import SharingImageLibrary from "./SharingImageLibrary";

export default function ImagePicker({
  value,
  onChange,
  label,
  description,
  imageLabel = label,
  fallbackImage,
  removeLabel,
  onGenerate,
  initialSource = "upload",
}: {
  value: string;
  onChange: (url: string) => void;
  label: string;
  description: string;
  imageLabel?: string;
  fallbackImage?: string;
  removeLabel?: string;
  onGenerate?: () => void;
  initialSource?: "" | "upload";
}) {
  const state = useCoverPicker({ content: "", value, onChange, initialSource });
  const { source } = state;
  const preview = state.selected || fallbackImage;
  return (
    <section className="cover-picker" aria-label={label}>
      <h3>{label}</h3>
      <p className="muted">
        {description}
      </p>
      <PickerPreview image={preview} label={imageLabel} removeLabel={removeLabel}
        onRemove={state.selected ? () => onChange("") : undefined} disabled={state.uploading} />
      <CoverSources onGenerate={onGenerate} state={state} imageOnly label={`${imageLabel} source`} mediaLabel="image" />
      {source === "upload" && (
        <div className="cover-upload">
          <input
            ref={state.file}
            type="file"
            aria-label={`Upload ${imageLabel.toLowerCase()}`}
            accept={coverImageTypes.join(",")}
            hidden
            disabled={state.uploading}
            onChange={state.uploadCover}
          />
          <button
            type="button"
            className="button"
            disabled={state.uploading}
            onClick={() => state.file.current?.click()}
          >
            <Upload size={15} />
            {state.uploading ? "Uploading…" : "Choose an image"}
          </button>
          <span className="muted">PNG, JPEG, WebP, or GIF · up to 10 MB</span>
        </div>
      )}
      {source === "library" && (
        <SharingImageLibrary value={value} onChange={onChange} purpose={imageLabel.toLowerCase()} />
      )}
      {source === "url" && (
        <label>
          {imageLabel} URL
          <input
            type="text"
            inputMode="url"
            maxLength={2048}
            value={value}
            placeholder="https://example.com/image.jpg"
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      )}
      {state.error && (
        <p className="notice" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
}

function PickerPreview({image, label, removeLabel = "Remove image", onRemove, disabled}: {
  image?: string; label: string; removeLabel?: string; onRemove?: () => void; disabled: boolean;
}) {
  if (!image) return null;
  return <div className="cover-selected">
    <img src={mediaPath(image)} alt={label} />
    {onRemove && <button type="button" className="button" disabled={disabled} onClick={onRemove}>
      <X size={14} />{removeLabel}
    </button>}
  </div>;
}
