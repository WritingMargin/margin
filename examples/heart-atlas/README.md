# The Living Atlas

An introductory heart-anatomy article using Margin's reusable illustration block.
The article includes an original vector cutaway, thirteen selectable structures,
an eight-stage animated circulation tour, an original beating 3D heart model,
source links, and a short knowledge check.

## Preview

From the Margin repository root:

```sh
node examples/heart-atlas/build-preview.mjs
python3 -m http.server 4173 --bind 127.0.0.1 --directory artifacts/heart-atlas
```

Open http://127.0.0.1:4173. The preview uses the real Margin Markdown renderer.
It has an editorial journal wrapper, but does not change your publication settings.
The Markdown can be imported into any Margin instance running the new renderer:

```sh
margin create --title 'A closer look at the human heart' \
  --slug inside-the-human-heart --file examples/heart-atlas/article.md --json
```

Keep `heart.json` and the inline `[Illustration]` payload in `article.md` aligned;
a test verifies that they match. Source prose is intentionally outside the widget
so the scientific explanation remains readable in every format.

See [the capability review](../../docs/heart-atlas-capability-review.md) for the
supported format, observed gaps, implemented changes and verification limits.


## 3D asset

The original schematic heart is a real GLB mesh. Regenerate it with
`node examples/heart-atlas/build-heart-model.mjs` (requires the repository's Three.js
dependency). The preview build copies it into its own `assets` directory. For a
Margin deployment, host `assets/heart.glb` and change the scene source URL in the
Markdown. The model has no third-party licensing dependency or patient data.

Play/Pause heartbeat controls the illustrative model pulse. The separate 2D flow
tour tracks a drop of blood; it is intentionally not synchronised with the pulse.
Both are labelled schematic and respect reduced-motion preferences.
