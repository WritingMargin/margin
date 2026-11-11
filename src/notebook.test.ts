import test from "node:test";
import assert from "node:assert/strict";
import { parseNotebook, notebookBlock } from "../shared/notebook";
import { codeLanguageLabel, codeLanguages } from "../shared/code-languages";
const notebook = {
  nbformat: 4,
  cells: [
    {
      cell_type: "code",
      source: ["print(1)"],
      outputs: [
        {
          data: { "text/plain": "1", "text/html": "<script>unsafe()</script>" },
        },
      ],
    },
  ],
};
test("Notebook import preserves the original cells and rejects malformed content", () => {
  const block = notebookBlock(JSON.stringify(notebook));
  assert.match(block, /^\s*```ipynb\n/);
  assert.deepEqual(parseNotebook(block.split("\n")[3]), notebook);
  assert.throws(() => parseNotebook('{"nbformat":4,"cells":[null]}'));
});
test("Jupyter notebooks can be chosen in the code block language menu", () => {
  assert.ok(codeLanguages.some(([id]) => id === "ipynb"));
  assert.equal(codeLanguageLabel("ipynb"), "Jupyter notebook");
});
