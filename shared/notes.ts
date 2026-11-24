export type NoteLink = {
  url: string;
  title?: string;
};

export type WorkspaceNote = {
  id: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  title: string;
  content: string;
  links: NoteLink[];
  isPublic: boolean;
  shared: boolean;
  shareToken?: string;
  shareUrl?: string;
  canEdit: boolean;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SharedNote = {
  id: string;
  title: string;
  content: string;
  links: NoteLink[];
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

function unsupportedNoteUrl(value: string) {
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  const hostWithPort = /^[^/:?#]+:\d+(?:[/?#]|$)/.test(value);
  return hasScheme && !hostWithPort && !/^https?:\/\//i.test(value);
}

export function normalizeNoteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed) || unsupportedNoteUrl(trimmed)) return "";
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname || /[%\\]/.test(parsed.hostname)) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

export function noteLinkMarkdown(url: string, label = url): string {
  const text = label.replace(/\s+/g, " ").replace(/[\\\[\]`*_<>]/g, "\\$&");
  return `[${text}](<${url}>)`;
}

/** Keep links saved by earlier versions visible in the note itself. */
export function noteBody(note: Pick<WorkspaceNote, "content" | "links">): string {
  if (!note.links.length) return note.content;
  const links = note.links.map((link) => {
    const url = normalizeNoteUrl(link.url);
    return url ? noteLinkMarkdown(url, link.title?.trim() || url) : link.url;
  });
  return [note.content.trimEnd(), ...links].filter(Boolean).join("\n\n");
}

export function noteDisplayTitle(note: Pick<WorkspaceNote, "title" | "content">): string {
  const title = note.title.trim();
  if (title) return title;
  const firstLine = note.content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : "Untitled note";
}

export function noteSnippet(content: string): string {
  const cleaned = content
    .replace(/\[Image\b[^\]]*\]/gi, "[Image]")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[Image]")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 140);
}

export function formatNoteForCopy(
  note: Pick<WorkspaceNote, "title" | "content" | "links">,
): string {
  const parts: string[] = [];
  const title = note.title.trim();
  if (title) parts.push(`# ${title}`);
  const body = noteBody(note).trim();
  if (body) parts.push(body);
  return parts.join("\n\n").trim();
}

export function withSharedNoteCovers(content: string, shareToken: string): string {
  if (!shareToken) return content;
  const encoded = encodeURIComponent(shareToken);
  return content.replace(
    /\/api\/public\/covers\/([a-f0-9-]{36})(?!\?note_share=)/gi,
    `/api/public/covers/$1?note_share=${encoded}`,
  );
}
