// Render only inert notebook output. Preserve the original JSON for download.
export type NotebookOutput = {
  text?: unknown;
  data?: Record<string, unknown>;
  traceback?: unknown;
};
export type NotebookCell = {
  cell_type: string;
  source: string | string[];
  outputs?: NotebookOutput[];
};
export interface Notebook {
  nbformat: number;
  cells: NotebookCell[];
}
export function notebookText(value: unknown) {
  return typeof value === "string"
    ? value
    : Array.isArray(value) && value.every((x) => typeof x === "string")
      ? value.join("")
      : "";
}
export function parseNotebook(source: string): Notebook {
  if (source.length > 1_500_000)
    throw new Error(
      "Use a notebook under 1.5 MB. Clear large outputs before embedding it.",
    );
  const notebook = JSON.parse(source);
  if (
    notebook?.nbformat !== 4 ||
    !Array.isArray(notebook.cells) ||
    !notebook.cells.every(
      (c: NotebookCell) =>
        c &&
        ["code", "markdown", "raw"].includes(c.cell_type) &&
        (typeof c.source === "string" ||
          (Array.isArray(c.source) &&
            c.source.every((s) => typeof s === "string"))) &&
        (c.outputs === undefined ||
          (Array.isArray(c.outputs) &&
            c.outputs.every((o) => o && typeof o === "object"))),
    )
  ) {
    throw new Error("Choose a valid Jupyter version 4 notebook.");
  }
  return notebook;
}
export function notebookBlock(source: string) {
  const notebook = parseNotebook(source);
  return "\n\n```ipynb\n" + JSON.stringify(notebook) + "\n```\n\n";
}
