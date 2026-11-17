import { useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import EmbedSelection from "./EmbedSelection";
import Markdown from "../Markdown";
import type { MediaPickerController } from "./useMediaPicker";
import { useOverlayFocus } from "../useOverlayFocus";

export default function MediaSelection({
  state,
}: {
  state: MediaPickerController;
}) {
  const selected = state.selected;
  if (!selected) return null;
  const embed = selected.kind === "audio" || selected.kind === "link";
  return (
    <SelectionDialog
      state={state}
      label={embed ? "Selected embed preview" : "Selected media preview"}
    >
      {embed ? (
        <EmbedSelection key={selected.src + selected.kind} state={state} />
      ) : (
        <MediaPreview state={state} />
      )}
    </SelectionDialog>
  );
}

function SelectionDialog({
  state,
  label,
  children,
}: {
  state: MediaPickerController;
  label: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useOverlayFocus(dialog, true, state.clear);
  useLayoutEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => {
      if (node?.open) node.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="media-selection-dialog"
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        state.clear();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) state.clear();
      }}
    >
      <button
        type="button"
        className="modal-close icon-button"
        aria-label="Close preview"
        title="Close preview"
        onClick={state.clear}
      >
        <X size={19} />
      </button>
      {children}
    </dialog>
  );
}

function MediaPreview({ state }: { state: MediaPickerController }) {
  return (
    <section className="media-tag-editor" aria-label="Selected media preview">
      <h3>Selected media</h3>
      <p className="muted">
        Preview with your saved defaults. Change individual layouts and create
        carousels using tags in the writer.
      </p>
      {state.defaults.error && (
        <p className="error-box" role="alert">
          Could not load your defaults.{" "}
          <button className="button" onClick={state.defaults.retry}>
            Retry
          </button>
        </p>
      )}
      <VideoOptions state={state} />
      <div className="media-tag-preview">
        <Markdown content={state.tag} />
      </div>
      {state.onInsert && (
        <button
          className="button primary"
          disabled={state.defaults.loading || !!state.defaults.error}
          onClick={() => {
            state.onInsert?.(`\n\n${state.tag}\n\n`);
            state.notify("Media inserted using your saved defaults.");
            state.clear();
          }}
        >
          Insert into post
        </button>
      )}
    </section>
  );
}

function VideoOptions({ state }: { state: MediaPickerController }) {
  if (state.selected?.kind !== "video") return null;
  return (
    <>
      <label>
        <input
          type="checkbox"
          checked={state.stickyVideo}
          onChange={(event) => state.setStickyVideo(event.target.checked)}
        />{" "}
        Keep video visible while scrolling
      </label>
      {state.stickyVideo && (
        <p className="muted">
          Playing uploaded videos follow readers as they scroll. Hosted players
          include a Keep visible button.
        </p>
      )}
    </>
  );
}
