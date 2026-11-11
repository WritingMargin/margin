export function tabCode(
  value: string,
  start: number,
  end: number,
  outdent = false,
) {
  if (outdent || start !== end) return indentCode(value, start, end, outdent);
  return {
    content: value.slice(0, start) + "  " + value.slice(end),
    start: start + 2,
    end: start + 2,
  };
}

export function indentCode(
  value: string,
  start: number,
  end: number,
  outdent = false,
) {
  const from = start > 0 ? value.lastIndexOf("\n", start - 1) + 1 : 0;
  const to = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const selected = value.slice(from, to);
  const lines = selected.split("\n");
  const edited = lines.map((line) =>
    outdent ? line.replace(/^(?:\t| {1,2})/, "") : "  " + line,
  );
  const firstDelta = edited[0].length - lines[0].length;
  const replacement = edited.join("\n");
  return {
    content: value.slice(0, from) + replacement + value.slice(to),
    start: Math.max(from, start + firstDelta),
    end: Math.max(from, end + replacement.length - selected.length),
  };
}
