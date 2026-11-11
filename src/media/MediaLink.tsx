import { linkURL } from "../../shared/link-preview";
import { resolveAudio } from "../../shared/audio";
import Select from "../components/Select";
import { safeMediaUrl } from "../media";
import { resolveVideo } from "../../shared/video";
import { hostedMediaInput } from "../../shared/hosted-media";
import type { MediaPickerController } from "./useMediaPicker";

const validators: Record<string, (url: string) => unknown> = {
  image: safeMediaUrl,
  video: resolveVideo,
  audio: resolveAudio,
  link: linkURL,
};
export default function MediaLink({ state }: { state: MediaPickerController }) {
  const { url, setUrl, kind, setKind, insert } = state;
  const valid = validators[kind]?.(url);
  return (
    <div className="media-picker-body">
      <p className="muted">
        Keep your recording with its host. Paste a published player link from
        Spotify, SoundCloud, YouTube, Vimeo, Descript, Riverside or VEED, or a
        direct media URL. No upload to Margin is needed.
      </p>
      <label>
        Media type
        <Select value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="image">Image</option>
          <option value="video">Video or embed</option>
          <option value="audio">Audio or podcast</option>
          <option value="link">Link preview card</option>
        </Select>
      </label>
      <label>
        Media URL or embed code
        <input
          type="text"
          value={url}
          placeholder="Paste a published recording link"
          onChange={(event) => {
            const value = hostedMediaInput(event.target.value);
            setUrl(value);
            state.setError("");
            setKind(detectKind(value, kind));
          }}
        />
      </label>
      <p className="muted">
        For Riverside, copy the embed code from the finished recording. Use
        published share links for Descript and VEED. Private editor links won’t
        play for readers. For a podcast from these hosts, choose Audio or
        podcast.
      </p>
      <button className="button" disabled={!valid} onClick={() => insert()}>
        Preview media
      </button>
    </div>
  );
}

function detectKind(value: string, current: string): string {
  const audio = resolveAudio(value);
  if (audio && audio.kind !== "embed") return "audio";
  if (resolveVideo(value))
    return audio && current === "audio" ? "audio" : "video";
  if (/\.(png|jpe?g|webp|gif|svg)(?:[?#]|$)/i.test(value)) return "image";
  return linkURL(value) ? "link" : current;
}
