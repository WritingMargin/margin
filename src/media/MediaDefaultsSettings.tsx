import Select from "../components/Select";
import { useRef, useState } from "react";
import CommandEditor from "../editor/CommandEditor";
import { api, json } from "../api";
import { mediaDefaultTag, parseMediaDefaultTag, type MediaDefaults, type MediaKind } from "../../shared/media-defaults";
import { useMediaDefaults } from "./useMediaDefaults";

export default function MediaDefaultsSettings({ notify }: { notify: (message: string) => void }) {
  const state = useMediaDefaults();
  if (state.loading) return <p role="status" className="media-picker-body">Loading media defaults…</p>;
  if (state.error) return <div className="error-box" role="alert">{state.error}<button className="button" onClick={state.retry}>Retry</button></div>;
  return <DefaultsForm defaults={state.defaults} notify={notify} />;
}
function DefaultsForm({ defaults, notify }: { defaults: MediaDefaults; notify: (message: string) => void }) {
  const [image, setImage] = useState(mediaDefaultTag("image", defaults.image));
  const [video, setVideo] = useState(mediaDefaultTag("video", defaults.video));
  const [audio, setAudio] = useState(defaults.audio?.mode || "player");
  const [link, setLink] = useState(defaults.link?.mode || "preview");
  const [saved, setSaved] = useState({ image, video, audio, link });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = image !== saved.image || video !== saved.video || audio !== saved.audio || link !== saved.link;
  async function save() {
    setBusy(true); setError("");
    try {
      const input = { audio: { mode: audio }, link: { mode: link }, image: parseMediaDefaultTag("image", image), video: parseMediaDefaultTag("video", video) };
      const result = await api<MediaDefaults>("/settings/media", json("PUT", input));
      const next = { audio, link, image: mediaDefaultTag("image", result.image), video: mediaDefaultTag("video", result.video) };
      setImage(next.image); setVideo(next.video); setSaved(next);
      window.dispatchEvent(new Event("margin:media-defaults"));
      notify("Media defaults saved. Existing posts are unchanged.");
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="media-tag-editor" aria-label="Media defaults">
    <h3>Default media layout</h3>
    <p className="muted">These saved defaults apply when you insert new images, videos, audio, or links in the writer. Existing posts keep their layout. Use frame="auto" to follow your publication’s design. Create carousels and edit individual media using content tags in your post.</p>
    <p className="muted">Use layout properties only. Type a property or press Ctrl+Space for suggestions.</p>
    <fieldset disabled={busy}>
      <DefaultTag kind="image" value={image} onChange={setImage} />
      <DefaultTag kind="video" value={video} onChange={setVideo} />
      <label>Audio display<Select value={audio} onChange={event => setAudio(event.target.value as typeof audio)}><option value="player">Compact player</option><option value="preview">Artwork preview</option></Select></label>
      <label>Link display<Select value={link} onChange={event => setLink(event.target.value as typeof link)}><option value="link">Plain link</option><option value="preview">Preview card</option></Select></label>
      {error && <p className="error-box" role="alert">{error}</p>}
      <button className="button primary" disabled={!dirty} onClick={() => void save()}>{busy ? "Saving…" : "Save defaults"}</button>
    </fieldset>
  </section>;
}
function DefaultTag({ kind, value, onChange }: { kind: MediaKind; value: string; onChange: (value: string) => void }) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  return <div className="media-default-tag"><h4>{kind === "image" ? "Image defaults" : "Video defaults"}</h4>
    <div className="media-tag-input"><CommandEditor editorRef={editorRef} value={value} onChange={onChange} ariaLabel={`${kind} default tag`} layoutKind={kind} /></div>
  </div>;
}
