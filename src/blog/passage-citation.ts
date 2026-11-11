import { normalizePassage } from "./passage-anchors";

export type PassageCitation = {
  quote: string;
  occurrence: number;
  prefix: string;
  suffix: string;
  revision: string;
};

function occurrences(text: string, quote: string): number[] {
  const matches: number[] = [];
  for (let from = 0; quote && from < text.length;) {
    const index = text.indexOf(quote, from);
    if (index < 0) break;
    matches.push(index);
    from = index + quote.length;
  }
  return matches;
}

export function createPassageCitation(text: string, quote: string, occurrence: number, revision = ""): PassageCitation | null {
  quote = normalizePassage(quote);
  const start = occurrences(text, quote)[occurrence];
  if (start === undefined || quote.length > 2000) return null;
  const end = start + quote.length;
  return { quote, occurrence, prefix: text.slice(Math.max(0, start - 64), start), suffix: text.slice(end, end + 64), revision };
}

export function citationURL(articleURL: string, citation: PassageCitation): string {
  const url = new URL(articleURL);
  // Pin the original reading view even if the recipient prefers simplified text.
  url.search = "?view=standard";
  url.hash = new URLSearchParams({ cite: "1", quote: citation.quote, at: String(citation.occurrence), before: citation.prefix, after: citation.suffix, rev: citation.revision }).toString();
  return url.href;
}

export function parsePassageCitation(hash: string): PassageCitation | null {
  if (hash.length > 30000) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.get("cite") !== "1") return null;
  const quote = normalizePassage(params.get("quote") || "");
  const at = params.get("at") || "";
  const prefix = params.get("before") || "";
  const suffix = params.get("after") || "";
  const revision = params.get("rev") || "";
  if (!validCitationFields(quote, at, prefix, suffix, revision)) return null;
  return { quote, occurrence: Number(at), prefix, suffix, revision };
}

function validCitationFields(quote: string, at: string, prefix: string, suffix: string, revision: string) {
  return quote.length > 0 && quote.length <= 2000 && /^\d{1,7}$/.test(at) && prefix.length <= 64 && suffix.length <= 64 && revision.length <= 256;
}

/** Prefer surrounding text after edits; never guess between ambiguous matches. */
export function resolveCitationOccurrence(text: string, citation: PassageCitation, revision = ""): number | null {
  const matches = occurrences(text, citation.quote);
  if (citation.revision && citation.revision === revision)
    return matches[citation.occurrence] === undefined ? null : citation.occurrence;
  const contextual = matches.flatMap((start, index) => {
    const before = text.slice(0, start);
    const after = text.slice(start + citation.quote.length);
    return before.endsWith(citation.prefix) && after.startsWith(citation.suffix) ? [index] : [];
  });
  if (contextual.length === 1) return contextual[0];
  return matches.length === 1 ? 0 : null;
}

export function citationText(quote: string, title: string, publication: string, author: string | undefined, url: string): string {
  const attribution = [author, title, publication].filter(Boolean).join(" · ");
  return `“${quote}”\n— ${attribution}\n${url}`;
}
