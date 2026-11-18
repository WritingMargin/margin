import { canPublish } from "../../shared/team";
import { useTeamIdentity } from "../auth/TeamContext";
import { contentTypeLabel } from "../../shared/content-types";
import { ArrowUpRight, CheckCheck, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { AdminController } from "./useAdminController";
import { editorSaveState } from "../editor/save-state";
import { visibilityChange } from "../editor/visibility-change";
import "./new-content-menu.css";
type Props = {
  state: Pick<
    AdminController,
    | "storageConfigured"
    | "post"
    | "theme"
    | "dirty"
    | "busy"
    | "editor"
    | "save"
    | "localDraft"
    | "conflicts"
  >;
};
/** Where the draft stands (shared by the footer and the editor's top bar). */
function saveState(state: Props["state"]) {
  const { storageConfigured, post, dirty, busy, localDraft } = state;
  const label = contentTypeLabel(post.contentType, state.theme.publicationType).toLowerCase();
  const published = post.status === "published";
  const visibility = visibilityChange(state.conflicts.baseline.current?.status, post.status, label);
  const status = visibility && !busy ? { label: "Visibility change not saved", detail: visibility.detail } : editorSaveState(published, !!post.id, dirty, busy, localDraft.status, storageConfigured, post.status === "archived", label);
  const displayed = stagedSaveState(state, localSaveState(status, localDraft, busy, post.status));
  return { label, visibility, displayed };
}
export function SaveStatus({ state }: Props) {
  const { displayed } = saveState(state);
  return (
    <div className="save-state" role="status" aria-live="polite" title={displayed.detail}>
      {state.dirty ? <span className="draft-dot" /> : <CheckCheck size={15} />}
      <span className="save-state-copy">
        <span className="save-state-label">{displayed.label}</span>
        <small>{displayed.detail}</small>
      </span>
    </div>
  );
}
export function SaveButtons({ state }: Props) {
  const { label, visibility } = saveState(state);
  const { busy, save } = state;
  return (
    <div className="bottom-actions">
      {visibility ? <button className="button primary" disabled={busy} onClick={() => save()}>{busy ? "Saving…" : visibility.action}</button> : <SaveActions state={state} label={label} />}
    </div>
  );
}
export default function EditorFooter({ state }: Props) {
  return (
    <footer className="editor-bottom editor-button-surface">
      <SaveStatus state={state} />
      <SaveButtons state={state} />
    </footer>
  );
}
function localSaveState(
  status: { label: string; detail: string },
  localDraft: AdminController["localDraft"],
  busy: boolean,
  postStatus: AdminController["post"]["status"],
) {
  return localDraft.pendingSync?.current && localDraft.status === "saved" && !busy
    ? { label: "Saved on this device", detail: postStatus === "draft" ? "Will sync as a private draft when you reconnect." : "Save these changes when connected." }
    : status;
}

function SaveActions({ state, label }: Props & { label: string }) {
  const { post, busy, dirty, save } = state;
  const { role } = useTeamIdentity();
  if (!canPublish(role)) return <button className="button primary" disabled={busy || (!!post.id && !dirty)} onClick={() => save()}>{busy ? "Saving…" : "Save draft"}</button>;
  return <PublisherSaveActions state={state} label={label} />;
}

/** Same split control as New post: Save is the primary action, and the
 *  attached summary opens Publish as the second option. */
function PublisherSaveActions({ state, label }: Props & { label: string }) {
  const { post, busy, dirty, save } = state;
  const published = post.status === "published";
  const saveLabel = { archived: "Save archive", draft: "Save draft", published: "Save draft" }[post.status];
  const publishLabel = published ? "Publish changes" : `Publish ${label}`;
  const publishTitle = published
    ? `Publish the reviewed changes to the live ${label}`
    : `Make this ${label} publicly readable`;
  const container = useRef<HTMLDivElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (details.current && !container.current?.contains(event.target as Node)) details.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const choose = (publish: boolean) => {
    if (details.current) details.current.open = false;
    void save(publish);
  };
  return (
    <div
      ref={container}
      className="new-content-menu save-content-menu"
      onBlur={(event) => {
        if (details.current && !event.currentTarget.contains(event.relatedTarget)) details.current.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          details.current.open = false;
          details.current.querySelector("summary")?.focus();
        }
      }}
    >
      <button
        type="button"
        className="button primary new-content-default"
        disabled={busy}
        onClick={() => choose(false)}
      >
        {busy ? <Loader2 className="spin" size={14} /> : null}
        {saveLabel}
      </button>
      <details ref={details}>
        <summary className="button primary" aria-label={`${saveLabel} options`}>
          <ChevronDown size={14} aria-hidden="true" />
        </summary>
        <div className="new-content-options" aria-label={`${saveLabel} options`}>
          <button
            type="button"
            className="button"
            disabled={busy || (published && !dirty)}
            title={publishTitle}
            onClick={() => choose(true)}
          >
            <ArrowUpRight size={15} aria-hidden="true" /> {publishLabel}
          </button>
        </div>
      </details>
    </div>
  );
}

function stagedSaveState(state: Props["state"], fallback: { label: string; detail: string }) {
 if (state.post.status === "draft" && state.post.baseRevision && !state.dirty && !state.busy) return { label: "Draft changes saved", detail: "The live article is unchanged. A publisher or owner can publish this draft." };
 return fallback;
}
