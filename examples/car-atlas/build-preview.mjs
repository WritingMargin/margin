import { build } from 'esbuild';
import { mkdir, copyFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
// Both articles deliberately share the same local Margin preview and asset root.
const outdir=path.join(root,'artifacts/heart-atlas');
await mkdir(path.join(outdir,'assets'),{recursive:true});
for(const file of await readdir(new URL('./assets/',import.meta.url)))
 await copyFile(new URL(`./assets/${file}`,import.meta.url),path.join(outdir,'assets',file));
await build({absWorkingDir:root,entryPoints:{'car-preview':'examples/car-atlas/preview.tsx'},outdir,bundle:true,splitting:true,format:'esm',jsx:'automatic',minify:true,loader:{'.md':'text','.woff':'file','.woff2':'file'},define:{'process.env.NODE_ENV':'"production"'}});
const postDir=path.join(outdir,'post/inside-an-electric-car');await mkdir(postDir,{recursive:true});
await writeFile(path.join(postDir,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Living Atlas — Inside an electric car</title><meta name="description" content="Explore a real 3D electric car, its exploded components and a clickable power-flow atlas."><link rel="stylesheet" href="/car-preview.css"></head><body><div id="root"></div><script type="module" src="/car-preview.js"></script></body></html>');
console.log('Car article added to the shared preview: http://127.0.0.1:4173/post/inside-an-electric-car/');
