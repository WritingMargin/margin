import { useState } from "react";
import { audioHelp, resolveAudio } from "../../shared/audio";
import UploadedAudio from "./UploadedAudio";
import { hostedMediaInput } from "../../shared/hosted-media";

export default function AudioCoverPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [url, setUrl] = useState(resolveAudio(value) ? value : "");
  return (
    <div className="cover-audio-input">
      <p className="muted">
        Replace the article cover with a hosted recording. Paste a podcast link
        or published Descript, Riverside or VEED player. No upload to Margin is
        needed.
      </p>
      <label>
        Recording URL or embed code
        <input
          type="text"
          value={url}
          placeholder="https://open.spotify.com/episode/…"
          onChange={(event) => setUrl(hostedMediaInput(event.target.value))}
        />
      </label>
      <p className="muted">{audioHelp}</p>
      <button
        type="button"
        className="button"
        disabled={!resolveAudio(url)}
        onClick={() => onChange(url.trim())}
      >
        Use as cover
      </button>
      <details>
        <summary>Or upload an audio file to Margin</summary>
        <UploadedAudio onSelect={onChange} />
      </details>
    </div>
  );
}
