import { build } from "esbuild";
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const outdir = path.join(root, "artifacts/heart-atlas");
await mkdir(outdir, { recursive: true });
await mkdir(path.join(outdir, "assets"), {recursive:true});
await copyFile(path.join(root, "examples/heart-atlas/assets/heart.glb"), path.join(outdir, "assets/heart.glb"));
for (const file of ["heart-poster.jpg", "heart-cutaway.jpg"])
  await copyFile(path.join(root, "examples/heart-atlas/assets", file), path.join(outdir, "assets", file));
await build({
  absWorkingDir: root,
  entryPoints: ["examples/heart-atlas/preview.tsx"],
  outdir,
  bundle: true,
  splitting: true,
  format: "esm",
  jsx: "automatic",
  minify: true,
  loader: { ".md": "text", ".woff": "file", ".woff2": "file" },
  define: { "process.env.NODE_ENV": '"production"' },
});
await writeFile(
  path.join(outdir, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Living Atlas — Inside the human heart</title><meta name="description" content="Explore heart anatomy with an expandable, clickable illustration, a circulation diagram, and a short knowledge check."><link rel="stylesheet" href="./preview.css"></head><body><div id="root"></div><script type="module" src="./preview.js"></script></body></html>`,
);
console.log(`Built Margin heart atlas preview: ${outdir}`);

// Mirror the sample post's canonical path in this static, unpublished preview.
const postDir = path.join(outdir, "post/inside-the-human-heart");
await mkdir(postDir, {recursive:true});
const entry = await readFile(path.join(outdir, "index.html"), "utf8");
await writeFile(path.join(postDir, "index.html"), entry.replaceAll('="./', '="/'));
