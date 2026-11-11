# Car atlas — a second article in the local Margin preview

Open `http://127.0.0.1:4173/post/inside-an-electric-car/`. The car and heart use the
same static preview directory, origin, asset root and Margin Markdown renderer.
The heart article links to the car and the car links back. No remote bucket or
live publication is changed; this continues the previously chosen local preview.

## What this tests

- A 537,056-byte original GLB exterior model with curved extruded body panels,
  glazing, rims, tyres, motor, battery and frame geometry.
- Six separately loaded GLBs in an authored exploded scene. Their scales and
  positions compensate for the loader's per-model normalisation, preserving
  component proportions. The exploded offsets are for explanation only.
- Direct mesh selection, labelled keyboard-operable selection, orbit, zoom,
  wireframe and reset using Margin's existing scene renderer.
- A five-region SVG atlas with four animated power-transfer stages, expanded
  view, manual stepping and pause/resume. It uses the same illustration schema
  as the heart article.
- Poster images, full component explanations and the complete flow transcript
  in RSS and print. Markdown retains the editable source. PDF saving still
  depends on the browser print dialog; no server PDF generation is added.

## Margin changes prompted by this example

Scene objects previously showed a label and implementation details (position and
scale) when selected. They now accept an optional `description` of up to 2,000
characters and show that explanation instead. RSS/print include every object's
explanation, with escaped text. Existing objects without descriptions still work.
The scene loader also avoids allocating unused box geometry for imported models.

No new car-specific renderer, schema shape, dependency or database migration was
needed. The car does not use heartbeat animation. There is no wheel rotation,
steering simulation, collision physics or automatically animated explosion.

## Rebuild

From the repository root:

```sh
node examples/car-atlas/build-car-model.mjs
node examples/car-atlas/sync-article.mjs
node examples/heart-atlas/build-preview.mjs
node examples/car-atlas/build-preview.mjs
CAR_EXPORT_DIR="$PWD/artifacts/heart-atlas/exports/car" \
  go -C backend test ./internal/blog -run TestCarArticleAlongsideHeartExports -count=1
python3 -m http.server 4173 --bind 127.0.0.1 --directory artifacts/heart-atlas
```

Skip the last command if the existing preview server is running. The Go test uses
an isolated publication, verifies both posts coexist in one RSS feed, and saves
real handler responses. The shared feed is `/rss.xml`; per-article reading views
and downloads are linked from the article. The existing heart reading view stays
available.

`build-car-model.mjs` generates the GLB assets and `exploded.json`. `scene.json`
and `power-flow.json` are authored specifications. `sync-article.mjs` updates
only their embedded blocks in `article.md`, preserving the surrounding prose.
The three JPEG posters were captured from the actual in-app browser renderings;
refresh them manually after changing geometry. Host all assets with the article
when deploying elsewhere.

## Evidence and scope

The article links to the U.S. Department of Energy's electric-car component guide
and NHTSA's electric/hybrid vehicle overview. The model is original schematic
geometry, not a particular manufacturer's design, measured CAD or assembly guide.

Automated tests validate actual GLB geometry and bounds, all six component models,
source/schema agreement, optional bounded descriptions, the continuous flow route,
escaped export text, both posts in one feed, and exact Markdown body preservation.
Browser checks cover component buttons and direct mesh selection, wireframe,
keyboard orbit/zoom, reset, flow stage progression, expansion with stage retention,
and all three static poster images loading in RSS. See the task's final report for
completed build/check results.
