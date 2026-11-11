import { useEffect, useState } from "react";
import { api, json } from "../api";
import Markdown from "../Markdown";
import Select from "../components/Select";
import { tagAttributes } from "../../shared/content-tags";
import type { LinkPreview } from "../../shared/link-preview";
import type { MediaPickerController } from "./useMediaPicker";

type Details = Omit<LinkPreview, "url">;
function usePreviewDetails(src: string, enabled: boolean) {
  const [details, setDetails] = useState<Details>({
    title: "",
    description: "",
    image: "",
  });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    api<LinkPreview>("/media/preview", {
      ...json("POST", { url: src }),
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted)
          setDetails({
            title: result.title,
            description: result.description,
            image: result.image,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "This site’s preview could not be loaded. Add details below or insert a plain link.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, src]);
  return { details, setDetails, loading, error };
}
function embedDefault(state: MediaPickerController, isLink: boolean) {
  return isLink
    ? state.defaults.defaults.link?.mode || "preview"
    : state.defaults.defaults.audio?.mode || "player";
}
export default function EmbedSelection({
  state,
}: {
  state: MediaPickerController;
}) {
  const selected = state.selected!;
  const isLink = selected.kind === "link";
  const [choice, setChoice] = useState("");
  const [title, setTitle] = useState("Listen to this article");
  const mode = choice || embedDefault(state, isLink);
  const preview = usePreviewDetails(selected.src, isLink);
  const tag = isLink
    ? `[Link${tagAttributes({ url: selected.src, mode, ...preview.details })}]`
    : `[Audio${tagAttributes({ src: selected.src, mode, title })}]`;
  return (
    <section className="media-tag-editor" aria-label="Selected embed preview">
      <EmbedDisplay isLink={isLink} mode={mode} onChange={setChoice} />
      {!isLink && (
        <label>
          Recording title
          <input
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
      )}
      {preview.loading && <p role="status">Fetching link preview…</p>}
      {preview.error && (
        <p className="notice" role="status">
          {preview.error}
        </p>
      )}
      {state.defaults.error && (
        <p className="error-box" role="alert">
          Could not load your defaults.{" "}
          <button className="button" onClick={state.defaults.retry}>
            Retry
          </button>
        </p>
      )}
      {isLink && <LinkDetails preview={preview} mode={mode} />}
      <div className="media-tag-preview">
        <Markdown content={tag} />
      </div>
      {state.onInsert && (
        <button
          className="button primary"
          disabled={[
            preview.loading,
            state.defaults.loading,
            state.defaults.error,
          ].some(Boolean)}
          onClick={() => {
            state.onInsert?.(`\n\n${tag}\n\n`);
            state.notify("Embed inserted.");
          }}
        >
          Insert into post
        </button>
      )}
    </section>
  );
}
function EmbedDisplay({
  isLink,
  mode,
  onChange,
}: {
  isLink: boolean;
  mode: string;
  onChange: (mode: string) => void;
}) {
  return (
    <>
      <h3>{isLink ? "Link preview" : "Audio preview"}</h3>
      <label>
        Display mode
        <Select value={mode} onChange={(event) => onChange(event.target.value)}>
          <option value={isLink ? "link" : "player"}>
            {isLink ? "Plain link" : "Compact player"}
          </option>
          <option value="preview">
            {isLink ? "Preview card" : "Artwork preview"}
          </option>
        </Select>
      </label>
      {!isLink && mode === "preview" && (
        <p className="muted">
          Spotify and SoundCloud display the recording’s artwork in their
          expanded player.
        </p>
      )}
    </>
  );
}
function LinkDetails({
  preview,
  mode,
}: {
  preview: ReturnType<typeof usePreviewDetails>;
  mode: string;
}) {
  const { details, setDetails, loading } = preview;
  return (
    <fieldset disabled={loading}>
      <label>
        Preview title
        <input
          value={details.title}
          maxLength={300}
          onChange={(event) =>
            setDetails({ ...details, title: event.target.value })
          }
        />
      </label>
      {mode === "preview" && (
        <>
          <label>
            Preview description
            <textarea
              value={details.description}
              maxLength={1000}
              onChange={(event) =>
                setDetails({ ...details, description: event.target.value })
              }
            />
          </label>
          <label>
            Preview image URL
            <input
              type="url"
              value={details.image}
              onChange={(event) =>
                setDetails({ ...details, image: event.target.value })
              }
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
