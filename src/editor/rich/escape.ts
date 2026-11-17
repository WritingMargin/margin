/**
 * Escaping for plain text written back to Markdown.
 *
 * Text the author typed must come back as the same text when the Markdown is
 * read again: a literal `*`, `[Image]`, `# 1`, or `&amp;` must not turn into
 * emphasis, a component, a heading, or an entity. `escapePositions` returns
 * the indices that need a backslash in front, so the serializer can keep its
 * character-by-character offset map exact around the inserted backslashes.
 */

const ALWAYS = new Set(["*", "`", "[", "]", "~"]);
const PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;
const ENTITY = /^&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/i;

function isWord(char: string | undefined) {
  return char !== undefined && WORD.test(char);
}

/** `_` only acts as emphasis at a word edge, so `snake_case` stays clean. */
function underscore(text: string, i: number) {
  return !(isWord(text[i - 1]) && isWord(text[i + 1]));
}

/** A backslash escapes the next punctuation, or a mark that may follow it. */
function backslash(text: string, i: number) {
  return i === text.length - 1 || PUNCTUATION.test(text[i + 1]);
}

const inlineRules: Record<string, (text: string, i: number) => boolean> = {
  _: underscore,
  "\\": backslash,
  "<": (text, i) => /[a-z/!?]/i.test(text[i + 1] ?? ""),
  "&": (text, i) => ENTITY.test(text.slice(i)),
  // The reader parses `:name` (even `:30` in "10:30") as a text directive.
  ":": (text, i) => /[a-z\d]/i.test(text[i + 1] ?? ""),
};

function needsInlineEscape(text: string, i: number) {
  const char = text[i];
  if (ALWAYS.has(char)) return true;
  const rule = inlineRules[char];
  return rule ? rule(text, i) : false;
}

/** Index to escape so a line can't start a heading, list, quote, rule, or directive. */
function lineStartEscape(text: string): number | null {
  const start = text.length - text.trimStart().length;
  const rest = text.slice(start);
  if (/^(#{1,6}|[-+*>])(\s|$)/.test(rest) || /^>/.test(rest)) return start;
  if (/^(=+|-+)\s*$/.test(rest) || /^::/.test(rest)) return start;
  const ordered = /^\d{1,9}([.)])(\s|$)/.exec(rest);
  return ordered ? start + ordered[0].indexOf(ordered[1]) : null;
}

export function escapePositions(text: string, lineStart: boolean): number[] {
  const positions = new Set<number>();
  for (let i = 0; i < text.length; i++) if (needsInlineEscape(text, i)) positions.add(i);
  const first = lineStart ? lineStartEscape(text) : null;
  if (first !== null) positions.add(first);
  return [...positions].sort((a, b) => a - b);
}

export function escapeText(text: string, lineStart: boolean): string {
  let out = "";
  let last = 0;
  for (const i of escapePositions(text, lineStart)) {
    out += text.slice(last, i) + "\\";
    last = i;
  }
  return out + text.slice(last);
}

/** Backtick fence long enough for the code, padded when it touches a backtick or space. */
export function codeFence(code: string) {
  let longest = 0;
  for (const run of code.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  const fence = "`".repeat(longest + 1);
  const pad = /^[`\s]|[`\s]$/.test(code) && code.trim() !== "" ? " " : "";
  return { open: fence + pad, close: pad + fence };
}

/** Link destination and title in a form that survives spaces, parentheses, and quotes. */
export function linkTail(href: string, title: string) {
  const destination = /[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, encodeURIComponent)}>` : href;
  const quoted = title ? ` "${title.replace(/["\\]/g, "\\$&")}"` : "";
  return `](${destination}${quoted})`;
}
