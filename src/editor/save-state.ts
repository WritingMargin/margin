type BackupStatus = "idle" | "pending" | "saved" | "error";
export function editorSaveState(published: boolean, saved: boolean, dirty: boolean, busy: boolean, backup: BackupStatus, storage: boolean, archived = false, contentLabel?: string) {
  contentLabel = saveContentLabel(contentLabel);
  if (busy) return { label: "Saving…", detail: "Waiting for the server to confirm." };
  if (!storage) return { label: "Storage needs attention", detail: "Check Settings before saving or publishing." };
  if (archived) return archivedSaveState(dirty, backup, contentLabel);
  if (dirty) return {
    label: published ? "Unpublished changes" : "Unsaved draft changes",
    detail: `${backupLabel(backup)} ${published ? `Publish changes to update the live ${contentLabel}.` : "Save draft to keep a private revision."}`,
  };
  if (published) return { label: "Published · Up to date", detail: "The saved version is live for readers." };
  return saved ? { label: "Draft saved", detail: "Private in your workspace. Not published." } : { label: "New draft", detail: "Save it privately or publish when ready." };
}
function backupLabel(status: BackupStatus) {
  if (status === "saved") return "Backed up in this browser.";
  if (status === "error") return "Browser backup unavailable.";
  return "Backing up in this browser…";
}
export function postSavedMessage(wasPublished: boolean, publish: boolean, contentLabel = "Post") {
  if (wasPublished) return "Published changes are live.";
  return publish ? `${contentLabel} published. It is now live for readers.` : "Draft saved. It is not published.";
}

function archivedSaveState(dirty: boolean, backup: BackupStatus, contentLabel: string) {
  return {
    label: dirty ? "Unsaved archive changes" : "Archived",
    detail: dirty ? `${backupLabel(backup)} Save to keep this ${contentLabel} archived.` : "Private in your workspace. Restore to draft or publish when ready.",
  };
}

function saveContentLabel(value = "post") { return value; }
