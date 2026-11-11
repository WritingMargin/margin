import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download } from "lucide-react";
import {
  notebookText,
  parseNotebook,
  type NotebookCell,
  type NotebookOutput,
} from "../../shared/notebook";
import "./blocks.css";
import "./notebook.css";

export default function Notebook({ source }: { source: string }) {
  const book = useMemo(() => {
    try {
      return parseNotebook(source);
    } catch {
      return null;
    }
  }, [source]);
  if (!book)
    return (
      <p className="block-error" role="alert">
        This notebook could not be displayed. Check the .ipynb file in the
        editor.
      </p>
    );

  return (
    <section
      className="rich-block jupyter-notebook"
      aria-label="Jupyter notebook"
    >
      <header className="block-heading">
        <h3>Jupyter notebook</h3>
      </header>
      <div className="block-toolbar">
        <span>{book.cells.length} cells</span>
        <button type="button" onClick={() => downloadNotebook(source)}>
          <Download size={14} aria-hidden="true" /> Download .ipynb
        </button>
      </div>
      {book.cells.map((cell, index) => (
        <NotebookCellView key={index} cell={cell} number={index + 1} />
      ))}
    </section>
  );
}
function NotebookCellView({
  cell,
  number,
}: {
  cell: NotebookCell;
  number: number;
}) {
  const source = notebookText(cell.source);
  return (
    <details className="block-data" open={number === 1}>
      <summary>
        {number}. {cell.cell_type} · {source.split("\n")[0]?.slice(0, 90)}
      </summary>
      {cell.cell_type === "markdown" ? (
        <div className="notebook-markdown">
          <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>
            {source}
          </ReactMarkdown>
        </div>
      ) : (
        <pre>{source}</pre>
      )}
      {cell.outputs?.map((output, i) => (
        <CellOutput key={i} output={output} number={number} />
      ))}
    </details>
  );
}
function CellOutput({
  output,
  number,
}: {
  output: NotebookOutput;
  number: number;
}) {
  const png = notebookText(output.data?.["image/png"]).replace(/\s/g, "");
  const value =
    notebookText(output.text) ||
    notebookText(output.data?.["text/plain"]) ||
    notebookText(output.traceback);
  const image = png && /^[a-zA-Z0-9+/]+=*$/.test(png);
  return (
    <div>
      {image && (
        <img
          src={"data:image/png;base64," + png}
          alt={"Output of cell " + number}
        />
      )}
      {value && <pre className="notebook-output">{value}</pre>}
      {!image && !value && (
        <small>
          Open the downloaded notebook in Jupyter to view this output.
        </small>
      )}
    </div>
  );
}
function downloadNotebook(source: string) {
  const url = URL.createObjectURL(
    new Blob([source], { type: "application/x-ipynb+json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "notebook.ipynb";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
