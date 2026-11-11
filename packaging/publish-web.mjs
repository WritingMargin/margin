import { copyFile, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const documents = ['public-manifest.json', 'index.html'];

export async function publishWeb(source, destination) {
  // A failed or incomplete build must never replace the currently served app.
  await Promise.all(documents.map(name => readFile(path.join(source, name))));
  await copyAssets(source, destination, true);
  // Every referenced asset is available before either entry document changes.
  for (const name of documents) await publishFile(path.join(source, name), path.join(destination, name));
}

async function copyAssets(source, destination, root = false) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (root && documents.includes(entry.name)) continue;
    const from = path.join(source, entry.name), to = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyAssets(from, to);
    else await publishFile(from, to);
  }
}

async function publishFile(source, destination) {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await copyFile(source, temporary);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}
