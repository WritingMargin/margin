# Heart atlas: Margin capability review

## Goal

Build an introductory scientific blog about heart anatomy with a clickable,
expandable illustration. The example is **The Living Atlas**, with an original
schematic heart cutaway, 13 explanatory regions, a circulation diagram, source
links, and a short question/explanation exercise.

## What was missing

| Reader need | Previous support | Implemented change |
| --- | --- | --- |
| Select a shape and read an explanation | Mermaid strict mode intentionally disables author click handlers; scenes only offer built-in 3D geometry | A reusable, declarative `illustration` block with vector shapes and numbered regions |
| Enlarge an anatomical drawing | Diagram zoom does not supply region explanations or an expanded atlas | Zoom from 100–200%, scroll, reset, and a native modal expanded view |
| Use keyboard and touch | No anatomical illustration component | Keyboard-operable markers and labelled buttons, previous/next navigation, native modal focus management and Escape dismissal |
| Read every explanation without interacting | No illustration fallback | A description transcript, plus escaped title/description/region text in server HTML and RSS |
| Author the experience through ordinary Margin content | Raw HTML and JavaScript are intentionally not executed | `[Illustration]` tags and `illustration` fences, schema validation, picker example and existing autocomplete integration |

The new block is general-purpose. It can explain machinery, cells, anatomy, or
other drawings without executing author code. It accepts SVG path geometry only,
fixed colour values, text and coordinates; it rejects scripts, remote paint URLs,
unknown properties, missing region references and unbounded input. No database
migration, external images, paid API, imported 3D model or new dependency is needed.

## Example and reproduction

- `examples/heart-atlas/article.md`: complete Margin article, ready to create as a draft.
- `examples/heart-atlas/heart.json`: original vector drawing and region descriptions.
- `examples/heart-atlas/preview.tsx` and `preview.css`: a local journal-style wrapper
  using Margin's real Markdown renderer, not a separate implementation of the widget.
- `node examples/heart-atlas/build-preview.mjs`: builds `artifacts/heart-atlas`.
- `python3 -m http.server 4173 --bind 127.0.0.1 --directory artifacts/heart-atlas`:
  opens the preview at `http://127.0.0.1:4173`.

To save into a connected Margin instance:

```sh
margin create --title 'A closer look at the human heart' \
  --slug inside-the-human-heart --file examples/heart-atlas/article.md --json
```

The destination needs this version of Margin to render illustrations. The local CLI
had no saved login, so the example is a local preview and Markdown draft, not a
published or persisted Margin post. Its custom journal header is preview styling;
it does not modify an existing publication's branding.

## Verification

- The actual article's JSON is parsed and compared with the source illustration.
- Tests reject executable properties, remote paint URLs, invalid references,
  duplicate IDs, out-of-bounds markers and excessive shape counts.
- Existing Markdown/tag and autocomplete tests exercise the new registered block.
- Go tests check readable escaped fallback for both tags and fenced blocks, and
  preserve ordinary code fences.
- Browser checks: shape selection, keyboard selection, expanded modal, zoom/reset,
  Escape dismissal, retained selection, and responsive layout at 390px and 1280px.
- No browser console errors were observed during those interactions.
- The full frontend production build (including lint and TypeScript) and the
  repository Go complexity/vet checks passed.

These checks establish that the requested interaction works. They are not a user
study or clinical validation. The illustration is explicitly schematic: vessels
and outlets are separated for clarity, proportions are simplified, and coronary
vessels are omitted. Sources are NIH/NHLBI and CDC, linked in the article.

## Animated flow and 3D follow-up

The static illustration did not express direction over time, and the original
scene block could only build primitive geometry. The follow-up adds:

| Gap | Implemented support | Result in this example |
| --- | --- | --- |
| No timed route through an illustration | Optional validated flow stages with bounded polyline coordinates, colours and descriptions | Eight stages through chambers, all four valves, lungs and body |
| No pause/resume or shared expanded playback | One flow controller, explicit Play/Pause, speed, Restart, stage selection and completion | Readers can follow a drop or inspect one stage without losing their place |
| No oxygen-exchange cue | Optional per-stage end colour and named landmarks | Blue-to-coral in lungs; coral-to-blue in body |
| Animated information missing in static reading | Full ordered text transcript in UI, RSS and server HTML | Every stage remains readable without motion or JavaScript |
| No imported 3D meshes | Self-contained GLB loading, fit/orbit/zoom/wireframe, load/error states, cancellation and resource disposal | Original 683,684-byte schematic heart model, generated locally |
| No visible heartbeat | Optional bounded pulse parameters on scene objects | An exaggerated 72 bpm pulse with pause/resume and phase readout |

The heart GLB is generated by `examples/heart-atlas/build-heart-model.mjs` and
stored in `examples/heart-atlas/assets/heart.glb`. The preview build copies it to
`artifacts/heart-atlas/assets/heart.glb`. To use the article in another Margin
publication, host that file and update the scene's `src`; saving the Markdown
alone cannot transfer the binary asset.

Automated checks cover route order, continuous endpoints, oxygen transitions,
arc-length interpolation, bounded timing and completion, invalid/executable
payload rejection, real GLB geometry, external-resource rejection, and pulse
periodicity. RSS tests cover both tags and fences, including escaped flow text.
Browser checks verified stage advancement, unchanged particle coordinates while
paused, retained stage in the expanded view, final colour on completion, actual
model loading, keyboard orbit, wireframe, pulse phase progression and pause/resume.
No browser console errors were reported. The focused frontend suite passed 27
tests; targeted Go RSS/public-HTML tests, TypeScript, lint, Go vet/complexity and
the production frontend build also passed.

## Remaining limits

The blood-flow animation follows one illustrative drop. Both sides of the real
heart pump together; step durations are teaching timings, not transit times or
heartbeats. The three-dimensional model is original schematic exterior geometry,
not a medical scan. Its pulse scales the mesh rather than simulating chambers,
valves, pressure or tissue mechanics. The 2D cutaway and 3D pulse are complementary
views and are not synchronised physiological simulations.

The scene viewer now plays embedded GLB and glTF clips. Authors can upload models to Margin or use hosted asset URLs. See the [interactive content guide](interactive-content.md) for current import formats and limits.
Authors must verify scientific content and choose meaningful explanations;
geometry/schema validation cannot establish anatomical accuracy.

## RSS, Markdown and print/PDF export audit

Checked on 16 October 2026 against the real Go RSS and download handlers, using
an isolated test publication populated from the checked-in heart article. The
responses are saved in `artifacts/heart-atlas/exports`; this does not publish the
article or change the local server's database.

| Format | Finding | Change / remaining limit |
| --- | --- | --- |
| RSS | All anatomy and flow text survived, but the cutaway had no image and the scene became JSON | Both blocks accept an optional `poster: {src, alt}`. RSS now includes the authored still, numbered anatomy descriptions, all eight flow stages, and a readable scene description/object list. URLs become absolute; text/attributes remain escaped. |
| Markdown download | The response includes publication metadata and preserves the entire authored body | This is editable **Margin source**, not a flattened article. Generic Markdown viewers do not execute Margin tags or JSON; no model or image binaries are embedded. The root-relative asset URLs need the original host or corresponding local assets. |
| Print / Save as PDF | The same static renderer is used for print | Posters, captions, numbered descriptions, all flow stages and both quiz tabs are present. Added sizing and definition-list print rules. Motion and orbiting cannot survive a conventional printed PDF. |
| Mermaid circulation diagram | Static export still contains the diagram definition | The article includes the readable circulation route immediately above it. Automated Mermaid rasterisation is not implemented. |
| In-app browser PDF save | The print HTML and images load, but invoking `window.print()` timed out without an accessible print dialog or PDF file | This audit verifies print **HTML**, not final PDF pagination. Margin currently relies on the browser's print dialog; it has no server-generated PDF download endpoint. |

The two JPEG posters were captured from the actual paused Three.js scene and
numbered SVG cutaway in the local in-app browser. They are authored static assets,
not automatic screenshots generated on each feed request; update them when the
model or geometry changes. They are included under `examples/heart-atlas/assets`
and copied by the preview build. Host these images alongside the GLB for a deployed
article. Feed readers may block remote images, so descriptions remain complete
without them. The RSS browser preview is a simple rendering of the actual feed
item HTML; it does not claim to emulate every RSS client.

Reproduce the local samples:

```sh
node examples/heart-atlas/build-preview.mjs
HEART_EXPORT_DIR="$PWD/artifacts/heart-atlas/exports" \
  go -C backend test ./internal/blog -run TestHeartArticleExports -count=1
```

The journal preview links to the feed, its reading view, the Markdown attachment
and print page. The saved print page's canonical and Markdown links are mirrored
by the preview fixture. Production download headers and access controls remain
covered by the existing export tests.

Verification: targeted Go RSS/readable/public HTML/download/print tests passed;
19 focused frontend tests, TypeScript, lint and Go vet/complexity checks passed.
In-app browser checks confirmed both RSS images loaded, 13 numbered structure
entries, eight ordered flow stages, and a successful Markdown download whose
contents match the handler response. Final PDF creation/pagination remains
unverified because of the in-app print limitation above.
