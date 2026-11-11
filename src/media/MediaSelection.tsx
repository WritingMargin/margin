import EmbedSelection from "./EmbedSelection";
import Markdown from "../Markdown";
import type { MediaPickerController } from "./useMediaPicker";

export default function MediaSelection({ state }: { state: MediaPickerController }) {
  if (state.selected?.kind === "audio" || state.selected?.kind === "link") return <EmbedSelection key={state.selected.src + state.selected.kind} state={state} />;
  return <section className="media-tag-editor" aria-label="Selected media preview">
    <h3>Selected media</h3>
    <p className="muted">Preview with your saved defaults. Change individual layouts and create carousels using tags in the writer.</p>
    {state.defaults.error && <p className="error-box" role="alert">Could not load your defaults. <button className="button" onClick={state.defaults.retry}>Retry</button></p>}
    <VideoOptions state={state} />
    <div className="media-tag-preview"><Markdown content={state.tag} /></div>
    {state.onInsert && <button className="button primary" disabled={state.defaults.loading || !!state.defaults.error} onClick={() => {
      state.onInsert?.(`\n\n${state.tag}\n\n`);
      state.notify("Media inserted using your saved defaults.");
    }}>Insert into post</button>}
  </section>;
}

function VideoOptions({ state }: { state: MediaPickerController }) {
  if (state.selected?.kind !== "video") return null;
  return <>
    <label><input type="checkbox" checked={state.stickyVideo} onChange={event => state.setStickyVideo(event.target.checked)} /> Keep video visible while scrolling</label>
    {state.stickyVideo && <p className="muted">Playing uploaded videos follow readers as they scroll. Hosted players include a Keep visible button.</p>}
  </>;
}
