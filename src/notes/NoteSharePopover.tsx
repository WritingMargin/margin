import { useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Link2,
  Lock,
  RefreshCw,
  Share2,
  Users,
} from "lucide-react";
import { formatNoteForCopy, noteDisplayTitle, type WorkspaceNote } from "../../shared/notes";
import { sitePath } from "../base-path";
import CopyField from "../components/CopyField";
import { useOverlayFocus } from "../useOverlayFocus";

type Props = {
  note: WorkspaceNote;
  busy: boolean;
  onTogglePublic: (isPublic: boolean) => void;
  onShareLink: (enabled: boolean, regenerate?: boolean) => void;
  notify: (message: string) => void;
  onClose: () => void;
};

export default function NoteSharePopover({
  note,
  busy,
  onTogglePublic,
  onShareLink,
  notify,
  onClose,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlayFocus(panel, true, onClose);
  const [copied, setCopied] = useState("");

  const teamUrl = new URL(
    sitePath(`/admin/notes/${encodeURIComponent(note.id)}`),
    location.origin,
  ).toString();
  const publicShareUrl = note.shareUrl
    ? new URL(note.shareUrl, location.origin).toString()
    : "";

  async function copyText(value: string, key: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      notify(success);
      window.setTimeout(() => setCopied((current) => (current === key ? "" : current)), 1800);
    } catch {
      notify("Clipboard access is unavailable.");
    }
  }

  return (
    <>
      <div className="note-share-backdrop" onClick={onClose} />
      <div ref={panel} className="note-share-popover" role="dialog" aria-label="Share note">
        <TeamShareSection
          note={note}
          busy={busy}
          copied={copied === "team"}
          onTogglePublic={onTogglePublic}
          onCopyTeamUrl={() => void copyText(teamUrl, "team", "Teammate link copied.")}
        />
        <ExternalShareSection
          note={note}
          busy={busy}
          publicShareUrl={publicShareUrl}
          onShareLink={onShareLink}
        />
        <ShareFooter
          note={note}
          publicShareUrl={publicShareUrl}
          copied={copied === "body"}
          onCopyBody={() =>
            void copyText(formatNoteForCopy(note), "body", "Note copied to clipboard.")
          }
        />
      </div>
    </>
  );
}

function TeamShareSection({
  note,
  busy,
  copied,
  onTogglePublic,
  onCopyTeamUrl,
}: {
  note: WorkspaceNote;
  busy: boolean;
  copied: boolean;
  onTogglePublic: (isPublic: boolean) => void;
  onCopyTeamUrl: () => void;
}) {
  return (
    <div className="note-share-section">
      <div className="note-share-row">
        <div>
          <strong>
            {note.isPublic ? <Users size={13} /> : <Lock size={13} />} Teammate access
          </strong>
          <p>
            {note.isPublic
              ? "Visible to everyone in this workspace."
              : "Only you can see this note right now."}
          </p>
        </div>
        {note.canEdit && (
          <button
            type="button"
            className={`button ${note.isPublic ? "" : "primary"}`}
            disabled={busy}
            onClick={() => onTogglePublic(!note.isPublic)}
          >
            {note.isPublic ? "Make private" : "Make public"}
          </button>
        )}
      </div>
      {note.isPublic && (
        <button type="button" className="note-share-copy-row" onClick={onCopyTeamUrl}>
          <Link2 size={13} aria-hidden="true" />
          <span>{copied ? "Copied team link" : "Copy teammate link"}</span>
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
}

function ExternalShareSection({
  note,
  busy,
  publicShareUrl,
  onShareLink,
}: {
  note: WorkspaceNote;
  busy: boolean;
  publicShareUrl: string;
  onShareLink: (enabled: boolean, regenerate?: boolean) => void;
}) {
  return (
    <div className="note-share-section">
      <div className="note-share-row">
        <div>
          <strong>
            <Globe size={13} /> External share link
          </strong>
          <p>
            {note.shared
              ? "Anyone with the link can view a read-only copy."
              : "Create a secret read-only link to share outside the workspace."}
          </p>
        </div>
        {note.canEdit && (
          <button
            type="button"
            className={`button ${note.shared ? "" : "primary"}`}
            disabled={busy}
            onClick={() => onShareLink(!note.shared)}
          >
            {note.shared ? "Disable" : "Create link"}
          </button>
        )}
      </div>
      {publicShareUrl && (
        <div className="note-share-url-row">
          <CopyField
            label="External share link"
            value={publicShareUrl}
            variant="table"
          />
          <div className="note-share-url-actions">
            <a
              href={publicShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="icon-button"
              title="Open shared note"
              aria-label="Open shared note"
            >
              <ExternalLink size={14} />
            </a>
            {note.canEdit && (
              <button
                type="button"
                className="icon-button"
                title="Regenerate link"
                aria-label="Regenerate link"
                disabled={busy}
                onClick={() => onShareLink(true, true)}
              >
                <RefreshCw size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ShareFooter({
  note,
  publicShareUrl,
  copied,
  onCopyBody,
}: {
  note: WorkspaceNote;
  publicShareUrl: string;
  copied: boolean;
  onCopyBody: () => void;
}) {
  const canNativeShare = "share" in navigator && typeof navigator.share === "function";
  async function nativeShare() {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: noteDisplayTitle(note),
        text: formatNoteForCopy(note),
        ...(publicShareUrl ? { url: publicShareUrl } : {}),
      });
    } catch {
      // User dismissed native share sheet.
    }
  }
  return (
    <div className="note-share-footer">
      <button type="button" className="button" onClick={onCopyBody}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy note text"}
      </button>
      {canNativeShare && (
        <button type="button" className="button" onClick={() => void nativeShare()}>
          <Share2 size={13} />
          More…
        </button>
      )}
    </div>
  );
}
