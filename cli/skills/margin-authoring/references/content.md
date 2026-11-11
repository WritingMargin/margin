# Margin authoring guide for LLMs

This reference describes the content syntax shipped with this Margin engine. Use it before generating rich content through the CLI, API, or MCP. It describes article bodies; publication template JSON is a separate format.

Through Margin’s embedded MCP server, read this guide at `margin://authoring/guide` and the schema/example catalog at `margin://authoring/blocks`. Use `get_post` before `update_post`; pass API body fields under `input` and the post ID at top level. The REST operation names below (`readPost`, `updatePost`, etc.) refer to the equivalent API workflow.

Contents: writing contract; code fences; citations; typography; Mermaid; charts; scenes; illustrations; polls; media; tabs and layout; API workflow.

## Writing contract

Return Markdown in the post `content` field, with the title in `title`. Do not wrap the entire article in a Markdown code fence unless the user is asking to see the source. Use ordinary Markdown for prose and code; use an interactive block only when it helps explain the subject. Use `updatePost.edits` with exact `oldText`/`newText` replacements for partial edits; each oldText must match once. Alternatively `updatePost.content` replaces the whole body. Both require the reviewed revision and cannot be combined. Never invent measurements, asset URLs, source citations, or unsupported component properties.

The five interactive fence names are `chart`, `mermaid`, `scene`, `illustration`, and `poll`. Chart, scene, illustration, and poll bodies must be strict JSON: quoted keys, no comments, trailing commas, functions, or unknown properties. Each interactive block is limited to 50,000 characters. Raw HTML, executable JavaScript, JSX, custom React components, and arbitrary CSS are not content extension points. Invalid content can be saved, so a successful save alone does not prove it will render.

## Code fences and tag equivalents

| Fence | Body | Equivalent paired tag |
| --- | --- | --- |
| `chart` | Chart JSON | `[Chart]` |
| `mermaid` | Mermaid definition | `[Diagram]` or `[Mermaid]` |
| `scene` | Scene JSON | `[Scene]` |
| `illustration` | Illustration JSON | `[Illustration]` |
| `poll` | Poll JSON | `[Poll]` |

Use triple backticks for a live interactive block:

````markdown
```chart
{"title":"Illustrative comparison","labels":["Before","After"],"series":[{"name":"Example units","values":[10,15]}]}
```
````

A `json` fence displays JSON as code; it does not render a chart. Ordinary language fences display highlighted source and never execute it. Code wraps by default and grows to show every line. Add `nowrap` after the language in the opening fence (for example, `` ```python nowrap ``) only when preserving long lines matters; that block can scroll horizontally. The picker offers `text`, `javascript`, `typescript`, `python`, `go`, `rust`, `java`, `csharp`, `c`, `cpp`, `json`, `bash`, `sql`, `xml`, `css`, `yaml`, `markdown`, and `diff`. Common aliases include `js`, `ts`, `py`, `sh`, `html`, and `yml`. Unknown languages remain readable code. Use a longer outer fence when showing syntax containing inner triple backticks.

````markdown
```python
def greet(name):
    return f"Hello, {name}"
```
````

Start with ordinary Markdown: paragraphs, headings, emphasis, lists, quotes, links, tables, and fenced code. Syntax examples should stay inside fenced code; otherwise the supported tags below render as content. Put block opening and closing tags on their own lines. Tags can contain Markdown unless their body is a diagram definition or JSON. Match every paired tag, and use quoted properties. Interactive content has a readable fallback in RSS.

## Citations

Use ordinary Markdown links for general references. Use an inline citation to associate a particular claim with its evidence:

```text
[Citation url="https://example.com/article" title="Source title"]The claim supported by this source.[/Citation]

[Citation url="https://example.com/report.pdf" title="Report title" page="12" quote="Exact wording from the source."]A supported observation.[/Citation]
```

These are syntax placeholders, not sources. Replace them with inspected sources and supported claims. Keep each citation on one source line. Include `quote` only for exact text verified in the source; omit it for a paraphrase without a verified quotation. Verify PDF page numbers rather than guessing. Citation previews and external text/page links depend on the source and viewer.

For an uploaded PDF with a highlighted region, use the editor's **Attach citation → PDF library** workflow to select the page and area. Preserve its generated citation; do not invent document identifiers or coordinates. Scanned PDFs support area selection, without OCR. Uploaded sources become public while cited by a published post, so use material intended for publication.

## Typography and short annotations

```text
[Font="Caveat"]A handwritten aside with **emphasis**.[/Font]

[Font="Kalam"]
A longer handwritten passage can span paragraphs.
[/Font]

[Highlight]An important phrase.[/Highlight]

[Callout tone="tip"]
A short, useful note with ordinary Markdown.
[/Callout]
```

Font names come from the blog's installed font catalog: Lora, Inter, Source Serif 4, Playfair Display, DM Sans, IBM Plex Mono, Caveat, Kalam, Dancing Script, and Oswald. Do not use arbitrary font downloads or CSS in a tag. Nested font sections restore the outer font when closed. Unknown names inherit the surrounding font. Callout tones are `note`, `tip`, and `warning`.

## Diagrams

```text
[Diagram]
flowchart TD
  accTitle: Article workflow
  accDescr: An article moves from writing through review to publication.
  A[Write] --> B[Review] --> C[Publish]
[/Diagram]
```

Use Mermaid syntax in the body. Do not include renderer configuration, HTML labels, scripts, or click handlers. The reader gets interactive diagram controls. Widths are `full`, `two-thirds`, `half`, and `third`; alignment is `left`, `center`, or `right`; optional height is an integer from 200 to 800 pixels. `wrap="true"` applies to smaller visuals aligned left or right. These layout properties also work on Chart, Scene, and Widget tags.

Omit layout properties for a full-width diagram with automatic height. Use `accTitle` and `accDescr` when supported by the diagram type, alongside a useful explanation in the article. Check labels at the default mobile zoom; shorten them, change orientation, or split the diagram before trying to fix small text with a taller frame. For an intentionally wrapped visual, use a fractional width with left or right alignment and place `[Clear]` before the next full-width section.

Automatic height currently caps diagram content at 640px and allows internal scrolling. Verify the complete diagram, including its ending, in both views using the bundled skill’s `references/preview.md` workflow; full width and valid syntax do not establish readability.

## Charts

```text
[Chart]
{
  "title": "Response time",
  "description": "Illustrative values, not a measured benchmark.",
  "type": "line",
  "xLabel": "Requests",
  "yLabel": "Milliseconds",
  "labels": ["10", "50", "100"],
  "series": [
    {"name": "Without cache", "values": [24, 42, 78], "color": "#b8794f"},
    {"name": "With cache", "values": [12, 16, 21], "color": "#537c68"}
  ]
}
[/Chart]
```

Use valid JSON, finite numeric values, distinct labels and series names, and exactly one value per label in each series. Supported types are `line`, `bar`, and `area`. Label illustrative data clearly; don't invent measurements to support a factual claim.

Labels are evenly spaced categories, not numeric X coordinates. Uneven intervals such as 10, 50, and 100 requests are not plotted at proportional distances; explain this or use a bar chart when spacing would mislead. Limits are 8 series, 200 labels, and values between -1e12 and 1e12. Readers can inspect an accessible data table. Put methodology, data provenance, and the main finding in the surrounding prose; the chart alone does not establish a comparison's validity.

### Writer’s Pad diagram tags

Type `/model` or `/figma` on a new line, or use bracket-tag autocomplete. The picker inserts the same one-line tags. Use the URL returned by an upload or a real asset/share URL in place of the examples.

```text
[Model src="/assets/assembly.glb" title="Assembly" clip="/assets/lift.json"]
[Figma url="https://www.figma.com/design/FILEKEY" title="Assembly drawing"]
```

`clip` is optional. Embedded GLB/glTF clips are available automatically. Both tags accept `width`, `height`, `align` and `wrap`. Put each tag on its own line. Double-click the folded label to edit its source. Use `[Scene]` for multiple objects and `[Illustration]` for artwork with clickable regions.

Drop a model onto the pad to upload it at the writing cursor. To attach a separate Three.js transform animation, drop one model and one JSON clip together, in either order.

## 3D scenes

```text
[Scene]
{
  "title": "A simple system",
  "description": "Drag to orbit and select an object to inspect it.",
  "objects": [
    {"shape": "box", "label": "Compute", "position": [-2, 0, 0], "color": "#648774"},
    {"shape": "sphere", "label": "Storage", "position": [2, 0, 0], "color": "#668aaa"}
  ]
}
[/Scene]
```

Required fields are `title` and `objects`; each object requires `shape` and `label`. Up to 40 objects are supported. Procedural shapes are `box`, `sphere`, `torus`, `cone`, and `cylinder`. `position` and `rotation` are three-number arrays (each -50 to 50, default `[0,0,0]`); rotations use radians. `scale` is 0.1–10, default 1. Colors use six-digit hex. Optional object `description` is plain text, up to 2,000 characters. Optional scene `background` defaults to `#f5f7f4`; `autoRotate` defaults to false.

Use `shape: "model"` with a real HTTPS or root-relative `src` ending in `.glb`, `.gltf`, `.obj`, or `.stl`. Each asset must fit in 20 MiB. For Three.js animation, use GLTFExporter and pass the clips in its `animations` option. Margin exposes each embedded clip with a selector and play/pause. A model can also reference one optional `animationSrc`, a hosted Three.js `AnimationClip.toJSON()` file ending in `.json`. Use position, scale, quaternion or individual rotation component tracks for the root or exact model node names. GLB and JSON glTF must be self-contained glTF 2.0, with at most 1,000 nodes and two million accessor elements. JSON glTF uses embedded base64 buffers. External resources and required extensions are unsupported. OBJ and STL supply static geometry. Remote model hosts must allow CORS and be permitted by the server’s model origin policy. Upload local files through the diagram picker or send raw file bytes (`application/octet-stream`) to `POST /api/media/models?format=glb|gltf|obj|stl|json`, choosing one format. Store the returned URL unchanged in `src` or `animationSrc`. Uploads are private until referenced by published content, and authorized draft previews can display them.

To create a self-contained 3D animation for someone to copy, return a complete `[Scene]` block containing built-in shapes. Add a `keyframes` array to each moving object. Each of its 1–32 frames has a positive `time` in seconds (up to 120, strictly increasing) and an absolute `position` or Euler `rotation` triple, or both. The initial transform is time zero. Motion is linear, uses radians, and loops at the last time of the longest track. For example:

```text
[Scene]
{"title":"Rolling wheel","objects":[{"label":"Wheel","shape":"torus","position":[-2,0,0],"keyframes":[{"time":2,"position":[2,0,0],"rotation":[0,0,-6.28]},{"time":4,"position":[-2,0,0],"rotation":[0,0,0]}]}]}
[/Scene]
```

Optional object `pulse` accepts `bpm` (30–180, default 72) and `amplitude` (0.01–0.15, default 0.07). It is illustrative scaling motion, not an anatomical simulation or imported animation playback. Optional `poster` is `{ "src": "HTTPS_OR_ROOT_RELATIVE_IMAGE", "alt": "Description" }`; it supplies an authored still for print, feeds and fallbacks. Poster URLs must be real assets. Scenes do not execute JavaScript.

## Clickable illustrations

```text
[Illustration]
{
  "title": "A two-layer component",
  "description": "Select a region to inspect its role.",
  "width": 400,
  "height": 300,
  "shapes": [
    {"path":"M80 60 H320 V240 H80 Z","fill":"#b66c60","region":"outer"},
    {"path":"M140 110 H260 V190 H140 Z","fill":"#ebc5ab","region":"inner"}
  ],
  "regions": [
    {"id":"outer","label":"Outer layer","description":"Surrounds the core.","x":105,"y":85},
    {"id":"inner","label":"Core","description":"Sits inside the outer layer.","x":200,"y":150}
  ]
}
[/Illustration]
```

Supply `title`, `regions` (1–30) and either `shapes` (up to 100) or `artwork` (or both). For a Figma export, use `"artwork":{"src":"/assets/design.svg","alt":"Description of the drawing"}` with a real hosted image. Set the canvas aspect ratio to match the frame and place markers in canvas coordinates. `width` and `height` are integers 100–1000, default 600. Each shape requires SVG path geometry in `path` and a six-digit `fill`; optional `stroke`, `strokeWidth` (0–20, default 2), and `region` link it to an existing region ID. Use path commands, never `<svg>` markup, URLs or event handlers. Each region requires unique `id`, `label`, `description`, `x`, and `y`; marker coordinates must be inside the declared canvas. Optional region `color` defaults to `#a64040`. `description`, `background` (default `#faf5ed`), and a `poster` with the same schema as scenes are optional.

Optional `flow` animates a journey over the illustration. It requires `title`, `description`, and `steps` (1–30). Each step requires `label`, `description`, `points` (2–40 `[x,y]` pairs), and six-digit `color`; optional `endColor` supplies a gradient and `region` must reference an existing region. Keep all points within the canvas; adjacent points must differ; every step must begin at the preceding step’s endpoint. Optional `secondsPerStep` is 2–12 (default 4). Optional `landmarks` has up to 10 `{label,x,y}` entries (labels up to 40 characters) within the canvas. The schema describes shape and bounds; these cross-field constraints also apply.

For a live Figma design, prototype or FigJam board, use `[Link mode="figma" url="FIGMA_SHARE_URL" title="Design title"]` on its own line. Supply the actual share link with its node or starting-point parameters. Readers load the embed on demand. Figma controls access.

## Reader polls

```text
[Poll]
{"id":"agree-with-this-1","title":"Do you agree?","type":"agree-disagree","allowReason":true}
[/Poll]
```

Polls accept `type: "multiple-choice"` with `options` containing 2–8 objects of `{ "id": "stable-id", "label": "Visible answer" }`, or `type: "agree-disagree"` with fixed Agree and Disagree choices. The optional `allowReason` property applies only to agree/disagree polls. A reason is private feedback visible only to the writer in poll results. Each poll needs a unique, stable lowercase `id` in its article; changing that ID starts a new vote tally. Signed-in readers can vote once per poll. Polls render a preview in drafts and accept votes on published articles.

## Images, video, and galleries

```text
[Image src="https://example.com/photo.jpg" alt="A quiet writing desk" caption="Morning notes" frame="border" width="full"]

[Video src="https://example.com/clip.mp4" caption="A short demonstration"]

[Carousel title="Field notes" fit="contain"]
[Image src="https://example.com/one.jpg" alt="First sketch"]
[Image src="https://example.com/two.jpg" alt="Second sketch"]
[/Carousel]
```

Replace example URLs with actual usable assets. Media `frame` values are `auto` (default, follows the publication), `plain`, `border`, and `polaroid`. Image widths are `full`, `wide`, and `small`. Videos support YouTube, Vimeo, Mux player/HLS, Cloudinary, direct MP4/WebM/Ogg/HLS, and native Margin upload URLs. For example:

```text
[Video src="https://youtu.be/aqz-KE-bpKQ" title="YouTube video"]
[Video src="https://vimeo.com/123456" title="Vimeo video"]
[Video src="https://player.mux.com/ACTUAL_PLAYBACK_ID" title="Mux video"]
[Video src="https://stream.mux.com/ACTUAL_PLAYBACK_ID.m3u8" title="Mux stream"]
[Video src="/api/public/videos/ACTUAL_UPLOAD_UUID" title="Uploaded walkthrough"]
```

Use the actual provider URL or returned upload URL; these examples do not assert that the placeholder assets exist. Arbitrary iframe pages are unsupported. Hosted videos need no upload to Margin. Video width can be `full`, `wide`, `small`, `two-thirds`, `half`, `third`, or a percentage from 25% to 100%; `ratio` can be `auto`, `16:9`, `4:3`, `1:1`, `9:16`, or `21:9`; `align` is left/center/right. `wrap="true"` works with fractional width and left/right alignment. Add `sticky="true"` to opt an article video into a corner player while readers scroll: native files/uploads/HLS follow after playback begins; hosted embeds provide a reader-controlled Keep visible button. The player stays mounted, never autoplays, and can be dismissed or returned inline. This is disabled by default and does not apply to homepage heroes.

Voice blogs can use an audio, Spotify, or SoundCloud URL as `cover`, or insert `[Audio src="https://example.com/episode.mp3" title="Listen to this article" caption="Transcript below"]` between paragraphs. `[Spotify src="https://open.spotify.com/episode/ACTUAL_22_CHARACTER_ID"]` uses the same player. Use a real Spotify episode/show/track/album/playlist/artist URL, never iframe HTML. Use `mode="preview"` for provider artwork or `mode="player"` for compact playback. `[SoundCloud src="https://soundcloud.com/ARTIST/TRACK" mode="preview"]` supports tracks, playlists, and widget URLs. Covers use `coverMode: "player" | "preview"`, preserved in revisions and drafts. Audio supports `title`, `caption`, `width` (full/wide/small), and `align` (left/center/right). Direct audio links support MP3/M4A/AAC/WAV/Ogg/OGA/FLAC. `uploadAudio` (`upload_audio` in MCP) accepts MP3/M4A/WAV/Ogg/FLAC as base64 JSON up to 10 MiB decoded or binary up to 50 MiB; `listAudio` (`list_audio`) lists recordings. Use returned canonical audio URLs unchanged in `cover` or `[Audio]`. Draft-only audio is private; published cover/content references make it public. Audio covers do not serve as sharing images: use `seo.image` for artwork. RSS and print retain listening links.

Website cards use `[Link url="https://example.com/story" mode="preview" title="Page title" description="Summary" image="https://example.com/cover.jpg"]`; use `mode="link"` for a plain link. Fetch real metadata with `previewLink` (`preview_link` in MCP), review the returned title/description/image, and save it in the tag. If a site blocks previews, use a plain link or supply truthful card text; never invent fetched metadata. Card previews are snapshots and need no reader-time fetching. Media defaults include `audio.mode` and `link.mode` for new insertions.

`listImages` / `listVideos` return already uploaded media. Insert their `secure_url` unchanged. `uploadImage` accepts a public HTTP(S) `url`, or base64 JSON `data` with matching `contentType`, up to 10 MiB. URL imports block internal destinations. Local files can use binary `POST /api/media/covers` without base64. `uploadVideo` accepts MP4/WebM as base64 JSON up to 10 MiB decoded or raw binary up to 50 MiB. Native videos are stored unchanged, without transcoding. Use native image URLs for `[Image]`, `cover` and `seo.image`; use native video URLs for `[Video]`. Apply a blog mount prefix only when fetching a canonical `/api/...` URL directly, not when saving content. Draft-only uploads require authentication; references from published content make them public. Carousels use 2–20 direct Image children. Carousel fit is `contain` or `cover`. Escape embedded double quotes in tag properties with `\"`.

## Tabs and layouts

```text
[Tabs title="Explore the idea" orientation="horizontal" variant="underline"]
[Tab title="Overview"]
## The big picture
Introduce the idea with Markdown.
[/Tab]
[Tab title="Details"]
- Add a useful detail.
- Explain a tradeoff.
[/Tab]
[/Tabs]

[Columns columns="2" ratio="equal"]
[Column]
First column.
[/Column]
[Column]
Second column.
[/Column]
[/Columns]

[Divider]
```

Tabs orientation is `horizontal` or `vertical`, variant is `underline`, `pills`, or `boxed`, and spacing is `compact` or `comfortable`. Optional `initial` selects a one-based tab, `accent` is a six-digit hex color, and `radius` is 0–24. Tab bodies can contain Markdown and rich blocks. Column count is `2` or `3`; ratios are `equal`, `wide-left`, and `wide-right`.

Each interactive chart, diagram, or scene block is limited to 50,000 characters. Preview the post in the editor before publication when it uses complex nesting or interactive content and preview access is available. Invalid structured data appears as an actionable rendering error; correct the source rather than suppressing it. If preview access is unavailable, report that rendering has not been verified.


Widgets group interactive visuals. `[Widget width="half" height="320" align="left" wrap="true"]` can wrap a single code fence or media tag; close it with `[/Widget]`. `[Widgets columns="2"]` with two `[Widget]` children makes two columns; three columns are also supported. For text alongside a visual, use `[Columns]` with `[Column]` children; each may contain multiple paragraphs or blocks. On narrow screens, columns stack in document order. `[Clear]` ends text wrapping before the next full-width section.

The equivalent colon directives are supported, for example `::image{src="URL" alt="Description"}` and `:::callout{tone="note"}` with a closing `:::`. For nested containers use more colons on the outer container than its children. Prefer paired square tags for LLM-generated nesting; do not mix unclosed tag and colon containers. Keep block tags on separate lines; Citation, Font and Highlight can be inline.

## Social cards

```text
[Social url="https://x.com/username/status/123456789" title="A discussion"]
```

Use a real public X, Instagram post/reel, or LinkedIn post URL, not a profile. These render link cards; readers choose whether to load the platform embed. A social post is not a video upload or an executable iframe.

## Save through API or MCP

Call `getAuthoringGuide` (`GET /api/public/authoring`) to retrieve this guide and the engine’s generated block schemas and examples. It is read-only, requires no credentials, and returns no publication content. Public equivalents are `/authoring.md` and `/authoring-blocks.json`. Use the deployed engine’s reference when it differs from an older installed CLI skill. The catalog’s `formatVersion` describes the reference response format, not a promise that another engine supports the same blocks.

1. Use `readPost` to get the current content and revision before editing. Preserve unrelated content and metadata.
2. Construct the Markdown using only supported fences/tags. JSON Schema covers the JSON shapes; also apply the catalog’s `rules` for cross-field, URL and renderer constraints. Check examples against the actual parser when a Margin source checkout is available. A successful JSON parse alone is insufficient.
3. After saving the draft, call `previewPost` (`GET /api/posts/{id}/preview`) or MCP `get_post view=preview` for a 30-minute bearer preview link that opens without an admin login. Anyone with it can view this exact draft revision and its referenced uploads; changes, publication, expiry, or discard invalidate it. Review returned structural warnings. Preview rich content, including narrow widths. Fix rendering errors. Mermaid syntax and visual readability still need renderer review; JSON schemas cannot validate them. State when no preview was available.
4. `updatePost` accepts `revision` and either changed `content` or sequential `edits: [{oldText,newText}]`. Ambiguous or missing matches return `409 EDIT_MATCH_CONFLICT` atomically. A missing revision returns `428`; a stale revision returns `409`. Reread and reconcile on conflict. `createPost` defaults to draft. Writers edit drafts; publishers/owners can change published content. Saving an existing published post changes it immediately.

A post-level table of contents is `tableOfContents: "off" | "top" | "left" | "right"`, not a Markdown block. Page layout and table-of-contents styling belong to template/design JSON, not the article body. Do not create undocumented blocks such as `react`, `html-widget`, or `toc` to approximate these settings.

## Common failures to avoid

- A `json` fence instead of `chart`: the JSON displays as source.
- A complete article wrapped in one `markdown` fence: the article displays as code.
- Unequal series/label lengths, duplicate series names, unknown JSON properties, or dangling illustration region references: the block fails validation.
- Mermaid init directives/frontmatter, HTML callbacks, or JSX: these are not supported content.
- A made-up upload/model URL: saving Markdown does not create that asset.
- Omitting existing body text during an insertion: `content` replacement deletes that text.
- Treating a saved draft as proof of valid rendering: preview and schema checks are separate.

## Interactive checklists

Use a Checklist wrapper to let readers tick tasks. Floating is an explicit author
choice and defaults off; ordinary Markdown task lists remain read-only.

```md
[Checklist title="Preparation" floating="true"]
- [ ] Gather the ingredients
- [ ] Prepare the work area
- [ ] Check the result
[/Checklist]
```

`title` is plain text up to 160 characters. Set `floating="false"` or omit it for
inline interaction only. With `true`, published pages offer a collapsible floating
panel whose checks stay in sync with the inline list. Multiple floating lists
share one panel with a selector. Reader progress is in memory only, resets on
reload, and never edits saved content. Do not claim persistence, shared completion,
or timers. RSS and print preserve the original task states as readable content.

## Get the public article link

After publishing, use native MCP `get_post` with `{"id":"POST_ID","view":"link"}`, or REST `getPostLink` (`GET /api/posts/{id}/link`). Read the returned `url`; do not construct a public URL from the MCP endpoint, local development address or an old slug. Margin uses the current publication domain and mount path. Drafts and archives return `409 POST_NOT_PUBLISHED`; the tool does not publish them. A renamed or unpublished post may change or invalidate a previously returned link.

## Research with native MCP tools

Start with the saved post ID. `search_publications` accepts `{"id":"POST_ID","q":"research question","limit":3}` and returns Crossref results with titles, DOI links and available abstracts. Omit `limit` for eight results. Open the relevant source and check what it supports before citing it.

Keep a selected result by passing its URL, title and optional excerpt to `save_research_source` in `input`, with the post ID at the top level. `list_research_sources` retrieves that post’s source library. The source library stays private. To cite a saved source, insert its citation in the draft in a separate edit.

Use `save_thinking_note` with `{"id":"POST_ID","input":{"body":"Question or observation","reason":"Why this matters"}}` to keep the author’s reasoning beside the draft. `list_thinking_notes` returns these notes and saved assistant insights in reverse chronological order. The author can continue reviewing the sources and notes in Margin’s writing assistant.

## Native MCP lifecycle

For native MCP edits, `get_post` selects `view: "current"`, `"draft"`, `"link"`, `"preview"`, or `"revision"` (the last requires a revision from `list_revisions`). `update_post` uses `action: "save"` (default, immediate save), `"save_draft"` (private staged changes), `"publish"`, `"unpublish"`, `"archive"`, or `"discard_draft"`. Save actions accept changed fields and the reviewed revision in `input`; other actions accept only the reviewed revision. Read `view: "draft"` before saving, publishing or discarding staged changes. Read `view: "current"` before unpublishing or archiving. Unpublishing retains pending edits as the private draft and the last live version in history. Draft saves return `draftUrl`, which requires an admin browser session.

MCP save and create replies are compact by default; use `fields` to request content. REST keeps its full default responses. Saves include advisory `warnings` for structural block issues and `publicationState` to distinguish `never_published`, `published`, `unpublished`, and `archived`. A staged draft can belong to a published post. The public-link 409 also includes that state. Set `cover` to display an image on the page; leave `seo.image` empty to use the image cover for sharing. A dedicated sharing image does not create a cover.
