/** Draft insertion controls live in the document and survive save/reload. */
export type DraftComponentKind = "media" | "citation" | "tabs" | "blocks";
export type DraftComponent = { kind: DraftComponentKind; text: string };
const kinds = new Set(["media", "citation", "tabs", "blocks"]);

export function draftComponentSource(kind: DraftComponentKind, text = "") {
  // Keep arbitrary selected text inside a single valid HTML comment. Readers
  // never see unfinished controls, and a saved draft retains their contents.
  const value = JSON.stringify({ kind, text }).replace(/-/g, "\\u002d");
  return `<!-- margin-insert ${value} -->`;
}

export function parseDraftComponent(source: string): DraftComponent | null {
  const match = /^<!-- margin-insert (.+) -->$/.exec(source.trim());
  if (!match) return null;
  try {
    const value = JSON.parse(match[1]);
    return kinds.has(value.kind) && typeof value.text === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}
