import { structuredPatch } from "diff";
export type DiffRow = {
  kind: "added" | "removed" | "context" | "note";
  text: string;
  oldLine: number | null;
  newLine: number | null;
};
export function textDiff(before: string, after: string) {
  const patch = structuredPatch(
    "before",
    "after",
    before,
    after,
    undefined,
    undefined,
    { context: 3, timeout: 200, maxEditLength: 10000 },
  );
  if (!patch) return null;
  let added = 0,
    removed = 0;
  const hunks = patch.hunks.map((hunk) => {
    let oldLine = hunk.oldStart,
      newLine = hunk.newStart;
    const rows: DiffRow[] = hunk.lines.map((line) => {
      if (line.startsWith("+")) {
        added++;
        return {
          kind: "added",
          text: line.slice(1),
          oldLine: null,
          newLine: newLine++,
        };
      }
      if (line.startsWith("-")) {
        removed++;
        return {
          kind: "removed",
          text: line.slice(1),
          oldLine: oldLine++,
          newLine: null,
        };
      }
      if (line.startsWith("\\"))
        return { kind: "note", text: line, oldLine: null, newLine: null };
      return {
        kind: "context",
        text: line.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
      };
    });
    return {
      label: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      rows,
    };
  });
  return { added, removed, hunks };
}
