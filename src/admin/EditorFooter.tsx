import { canPublish } from "../../shared/team";
import { useTeamIdentity } from "../auth/TeamContext";
import { contentTypeLabel } from "../../shared/content-types";
import { ArrowUpRight, CheckCheck, Loader2 } from "lucide-react";
import type { AdminController } from "./useAdminController";
import { editorSaveState } from "../editor/save-state";
import { visibilityChange } from "../editor/visibility-change";
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
export default function EditorFooter({ state }: Props) {
  const { storageConfigured, post, dirty, busy, save, localDraft } = state;
  const label = contentTypeLabel(post.contentType, state.theme.publicationType).toLowerCase();
  const published = post.status === "published";
  const visibility = visibilityChange(state.conflicts.baseline.current?.status, post.status, label);
  const status = visibility && !busy ? { label: "Visibility change not saved", detail: visibility.detail } : editorSaveState(published, !!post.id, dirty, busy, localDraft.status, storageConfigured, post.status === "archived", label);
  const displayed = stagedSaveState(state, localSaveState(status, localDraft, busy, post.status));
  return (
    <footer className="editor-bottom editor-button-surface">
      <div className="save-state" role="status" aria-live="polite" title={displayed.detail}>
        {dirty ? <span className="draft-dot" /> : <CheckCheck size={15} />}
        <span className="save-state-copy">
          <span className="save-state-label">{displayed.label}</span>
          <small>{displayed.detail}</small>
        </span>
      </div>
      <div className="bottom-actions">
        {visibility ? <button className="button primary" disabled={busy} onClick={() => save()}>{busy ? "Saving…" : visibility.action}</button> : <SaveActions state={state} label={label} />}
      </div>
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

function PublisherSaveActions({ state, label }: Props & { label: string }) {
  const { post, busy, dirty, save } = state;
  const published = post.status === "published";
  return <>
        <button className="button" disabled={busy || (!!post.id && !dirty)} onClick={() => save()}>
          {busy ? <Loader2 className="spin" size={14} /> : null}{{ archived: "Save archive", draft: "Save draft", published: "Save draft" }[post.status]}
        </button>
        <button
          className="button primary"
          disabled={busy || (published && !dirty)}
          title={published ? `Publish the reviewed changes to the live ${label}` : `Make this ${label} publicly readable`}
          onClick={() => save(true)}
        >
          {published ? "Publish changes" : `Publish ${label}`}
          <ArrowUpRight size={15} />
        </button>
  </>;
}

function stagedSaveState(state: Props["state"], fallback: { label: string; detail: string }) {
 if (state.post.status === "draft" && state.post.baseRevision && !state.dirty && !state.busy) return { label: "Draft changes saved", detail: "The live article is unchanged. A publisher or owner can publish this draft." };
 return fallback;
}
