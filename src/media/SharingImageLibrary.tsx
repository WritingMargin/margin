import AccountGate from "../auth/AccountGate";
import { mediaPath } from "../base-path";
import { useEffect, useState } from "react";
import { api } from "../api";
import { galleryImageTitle, galleryImageURL, type GalleryAsset } from "./gallery-images";

type Props = {
  value: string;
  onChange: (url: string) => void;
  purpose?: string;
};
function ImageLibrary({
  value,
  onChange,
  source,
  purpose = "sharing image",
}: Props & {
  source: "uploads" | "cloudinary";
}) {
  const [images, setImages] = useState<GalleryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    const endpoint =
      source === "cloudinary" && purpose === "cover"
        ? "/media"
        : `/media/images?source=${source}`;
    api<{ resources: GalleryAsset[] }>(endpoint, {
      signal: request.signal,
    })
      .then((result) => {
        if (!request.signal.aborted)
          setImages(result.resources.filter((image) => galleryImageURL(image)));
      })
      .catch((error) => {
        if (!request.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [attempt, source, purpose]);
  if (loading)
    return (
      <p className="muted" role="status">
        Opening your library…
      </p>
    );
  if (error)
    return (
      <div>
        <p className="notice" role="alert">
          {error}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => setAttempt(attempt + 1)}
        >
          Retry
        </button>
      </div>
    );
  if (!images.length)
    return (
      <p className="muted">
        No usable images in this library yet. Upload an image or choose another
        source.
      </p>
    );
  return (
    <div
      className="cover-candidates"
      aria-label={`${purpose.charAt(0).toUpperCase() + purpose.slice(1)} library`}
    >
      {images.map((image) => (
        <LibraryImage
          key={image.secure_url}
          image={image}
          value={value}
          onChange={onChange}
          purpose={purpose}
        />
      ))}
    </div>
  );
}

function LibraryImage({
  image,
  value,
  onChange,
  purpose,
}: Props & { image: GalleryAsset }) {
  const [failed, setFailed] = useState(false);
  const url = galleryImageURL(image)!;
  const label =
    image.resource_type === "video"
      ? `${galleryImageTitle(image)} (video frame)`
      : galleryImageTitle(image);
  return (
    <button
      type="button"
      disabled={failed}
      aria-label={`Use ${label} as ${purpose}`}
      aria-pressed={mediaPath(value) === mediaPath(url)}
      onClick={() => onChange(url)}
    >
      <img
        src={mediaPath(url)}
        alt={label}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <span>{failed ? "Image unavailable" : label}</span>
    </button>
  );
}

export default function SharingImageLibrary(props: Props) {
  const [source, setSource] = useState<"uploads" | "cloudinary">("uploads");
  return (
    <>
      <div className="section-tabs">
        <button
          type="button"
          className={source === "uploads" ? "active" : ""}
          aria-pressed={source === "uploads"}
          onClick={() => setSource("uploads")}
        >
          Uploaded images
        </button>
        <button
          type="button"
          className={source === "cloudinary" ? "active" : ""}
          aria-pressed={source === "cloudinary"}
          onClick={() => setSource("cloudinary")}
        >
          Cloudinary
        </button>
      </div>
      {props.purpose === "cover" && source === "cloudinary" && (
        <p className="muted">
          Choose an image or a still frame from a video. Videos use their middle
          frame as the cover.
        </p>
      )}
      {source === "cloudinary" ? (
        <AccountGate feature="Cloudinary integration">
          <ImageLibrary {...props} source={source} />
        </AccountGate>
      ) : (
        <ImageLibrary {...props} source={source} />
      )}
    </>
  );
}
