export function applyHeading(
  content: string,
  start: number,
  end: number,
  level: number,
) {
  if (!Number.isInteger(level) || level < 0 || level > 6)
    throw new RangeError("Invalid heading level");
  const from = start === 0 ? 0 : content.lastIndexOf("\n", start - 1) + 1;
  const last = end > start && content[end - 1] === "\n" ? end - 1 : end;
  const newline = content.indexOf("\n", last);
  const to = newline === -1 ? content.length : newline;
  const lines = content.slice(from, to).split("\n");
  const edits = lines.map((line) => headingLine(line, level, lines.length > 1));
  const replacement = edits.map((edit) => edit.text).join("\n");
  const first = edits[0];
  const caret = from + Math.max(first.prefix, start - from + first.delta);
  const delta = replacement.length - (to - from);
  return {
    content: content.slice(0, from) + replacement + content.slice(to),
    start: caret,
    end: start === end ? caret : Math.max(caret, end + delta),
  };
}
function headingLine(line: string, level: number, preserveBlank: boolean) {
  if (preserveBlank && !line.trim()) return { text: line, prefix: 0, delta: 0 };
  const match = /^( {0,3})(?:#{1,6}(?:[\t ]+|$))?/.exec(line)!;
  const prefix = match[1] + (level ? "#".repeat(level) + " " : "");
  return {
    text: prefix + line.slice(match[0].length),
    prefix: prefix.length,
    delta: prefix.length - match[0].length,
  };
}
