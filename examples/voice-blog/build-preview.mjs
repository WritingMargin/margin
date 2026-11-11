import { build } from "esbuild";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const outdir = path.join(root, "artifacts/voice-blog-sample");
await mkdir(outdir, { recursive: true });
await build({
  absWorkingDir: root, entryPoints: ["examples/voice-blog/preview.tsx"], outdir,
  bundle: true, splitting: true, format: "esm", jsx: "automatic", minify: true,
  loader: { ".md": "text", ".woff": "file", ".woff2": "file", ".svg": "file" },
  define: { "process.env.NODE_ENV": '"production"', "import.meta.env": '{"BASE_URL":"/"}' },
});
await copyFile(path.join(root, "examples/voice-blog/article.md"), path.join(outdir, "article.md"));
await writeFile(path.join(outdir, "index.html"), '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stories in sound — Margin sample</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>');
console.log(`Built voice blog sample: ${outdir}`);
